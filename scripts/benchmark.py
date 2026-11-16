import argparse
import csv
import hashlib
import json
import math
import os
import platform
import random
import statistics
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from test import dataset, run

def command(*args):
    return subprocess.check_output(args, text=True).strip()

def cpu_info():
    try:
        cpu = next(line.split(":", 1)[1].strip() for line in Path("/proc/cpuinfo").read_text().splitlines() if line.startswith("model name"))
    except (OSError, StopIteration):
        cpu = platform.processor() or "unknown"
    try:
        mem = next(line.split(":", 1)[1].strip() for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemTotal:"))
    except (OSError, StopIteration):
        mem = "unknown"
    quota = None
    try:
        q, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        if q != "max":
            quota = int(q) / int(period)
    except (OSError, ValueError):
        pass
    return {"cpu": cpu, "logical_cpus": os.cpu_count(), "affinity_cpus": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else os.cpu_count(), "cpu_quota": quota, "memory": mem, "os": platform.platform(), "compiler": command("gcc", "--version").splitlines()[0], "flags": "-O3 -std=c11 -Wall -Wextra -ffp-contract=off; parallel: -fopenmp", "binding": {"OMP_PROC_BIND": "close", "OMP_PLACES": "cores", "OMP_DYNAMIC": "false"}}

def chart(rows, metric, label):
    width, height = 820, 370
    ns = sorted(set(r["n"] for r in rows))
    ps = sorted(set(r["threads"] for r in rows if r["mode"] == "openmp"))
    values = [r[metric] for r in rows if r["mode"] == "openmp"]
    ymax = max(values or [1]) * 1.12
    colors = ["#7595ff", "#36d8ba", "#edb66c", "#d39bff"]
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{label}"><rect width="100%" height="100%" fill="#101621"/><g fill="#c3ccdc" font-family="sans-serif" font-size="12">']
    for i in range(5):
        y = 280-i*55
        parts.append(f'<path d="M65 {y}H790" stroke="#273143"/><text x="8" y="{y+4}">{ymax*i/4:.2f}</text>')
    for i, p in enumerate(ps):
        x = 65 + i*725/max(1,len(ps)-1)
        parts.append(f'<text x="{x}" y="306" text-anchor="middle">{p}</text>')
    for i,n in enumerate(ns):
        series = sorted((r for r in rows if r["mode"] == "openmp" and r["n"] == n), key=lambda r:r["threads"])
        coords=[]
        for r in series:
            x = 65 + ps.index(r["threads"])*725/max(1,len(ps)-1)
            y = 280 - r[metric]/ymax*220
            coords.append(f"{x},{y}")
            parts.append(f'<circle cx="{x}" cy="{y}" r="4" fill="{colors[i%4]}"/>')
        points = " ".join(coords)
        parts.append(f'<polyline fill="none" stroke="{colors[i%4]}" stroke-width="2" points="{points}"/><text x="{70+i*185}" y="342" fill="{colors[i%4]}">N = {n:,}</text>')
    parts.append(f'<text x="410" y="365" text-anchor="middle">Threads · {label}</text></g></svg>')
    return "".join(parts)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--sizes", default="256,1024,4096,8192")
    parser.add_argument("--repeats", type=int, default=5)
    args=parser.parse_args()
    if args.repeats < 5:
        parser.error("At least five repetitions are required")
    sizes=[int(s) for s in args.sizes.split(",")]
    if any(n < 1 or n > 32768 for n in sizes):
        parser.error("Sizes must be in 1..32768")
    os.environ.update(OMP_PROC_BIND="close", OMP_PLACES="cores", OMP_DYNAMIC="false")
    env=cpu_info()
    threads=[1,2,4,8]
    configs=[("sequential",1)]+[("openmp",p) for p in threads]
    raw=[]
    inputs=[]
    for n in sizes:
        data=dataset(n)
        inputs.append({"n": n, "seed":42, "sha256":hashlib.sha256(data).hexdigest(), "distribution":"uniform [-1,1], six float32 values per body"})
        baseline=run("sequential",data)
        if baseline.returncode:
            raise RuntimeError(baseline.stderr.decode())
        expected=hashlib.sha256(baseline.stdout).hexdigest()
        for mode,p in configs:
            warm=run("parallel" if mode=="openmp" else "sequential",data,*(["--threads",str(p)] if mode=="openmp" else []))
            assert warm.returncode == 0 and hashlib.sha256(warm.stdout).hexdigest()==expected
        for trial in range(args.repeats):
            order=configs.copy()
            random.Random(42+n+trial).shuffle(order)
            for mode,p in order:
                result=run("parallel" if mode=="openmp" else "sequential",data,*(["--threads",str(p)] if mode=="openmp" else []))
                if result.returncode or hashlib.sha256(result.stdout).hexdigest()!=expected:
                    raise RuntimeError(f"Invalid output: N={n}, p={p}, mode={mode}")
                info=json.loads(result.stderr)
                assert info["threads"]==p and info["seconds"]>0
                raw.append({**info,"trial":trial+1,"sha256":expected})
        print(f"N={n}: {args.repeats} rounds completed", flush=True)
    rows=[]
    for n in sizes:
        baseline=statistics.mean(r["seconds"] for r in raw if r["n"]==n and r["mode"]=="sequential")
        for mode,p in configs:
            samples=[r["seconds"] for r in raw if r["n"]==n and r["mode"]==mode and r["threads"]==p]
            mean=statistics.mean(samples)
            speedup=baseline/mean
            rows.append({"n":n,"mode":mode,"threads":p,"mean":mean,"stddev":statistics.stdev(samples),"speedup":speedup,"efficiency":speedup/p,"samples":samples,"repeats":len(samples),"oversubscribed":p > min(env["affinity_cpus"] or p, env["cpu_quota"] or p)})
    result={"schema":1,"generated_at":datetime.now(timezone.utc).isoformat(),"source_commit":os.environ.get("GITHUB_SHA",command("git","rev-parse","HEAD")),"environment":env,"methodology":{"steps":10,"repeats":args.repeats,"timing":"CLOCK_MONOTONIC: simulation kernel only; includes OpenMP team creation and barriers, excludes input/output and allocation","order":"deterministically shuffled per round","warmup":"one unmeasured run per configuration and size","validation":"SHA-256 of every final state equals sequential output","environment_note":"Shared CI runner; measurements depend on load and available CPU time."},"inputs":inputs,"rows":rows,"raw":raw}
    root=Path("results");root.mkdir(exist_ok=True)
    (root/"benchmark.json").write_text(json.dumps(result,indent=2)+"\n")
    with (root/"runs.csv").open("w",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=raw[0].keys());writer.writeheader();writer.writerows(raw)
    for metric,label in (("mean","Tempo (s)"),("speedup","Speedup"),("efficiency","Eficiência")):
        (root/f"{metric}.svg").write_text(chart(rows,metric,label))
    report=["# Resultados medidos\n",f"Commit: `{result['source_commit']}`\n",f"CPU: {env['cpu']}. CPUs lógicas: {env['logical_cpus']}; afinidade: {env['affinity_cpus']}; quota: {env['cpu_quota']}. Memória: {env['memory']}.\n",f"Compilador: {env['compiler']}. Flags: `{env['flags']}`.\n","Cinco repetições ou mais, uma execução de aquecimento por configuração e tamanho; ordem alternada deterministicamente. Tempo do kernel, incluindo criação da equipe e barreiras; sem E/S e alocação. Todas as saídas conferidas por SHA-256. Ambiente de CI compartilhado: não representa desempenho garantido em outro computador.\n","| N | Versão | Threads | Média (s) | Desvio (s) | Speedup | Eficiência |\n|---:|---|---:|---:|---:|---:|---:|"]
    for r in rows:
        report.append(f"| {r['n']} | {r['mode']} | {r['threads']} | {r['mean']:.6f} | {r['stddev']:.6f} | {r['speedup']:.3f} | {100*r['efficiency']:.1f}% |")
    report.extend(["\n![Tempo](mean.svg)\n","![Speedup](speedup.svg)\n","![Eficiência](efficiency.svg)\n","## Discussão\n","Para cada tamanho, o baseline é a versão sequencial compilada com as mesmas flags. O OpenMP com uma thread mede seu overhead. Casos com mais threads do que CPUs disponíveis estão marcados como oversubscribed no JSON e devem ser interpretados separadamente.\n"])
    for n in sizes:
        best=min((r for r in rows if r["n"]==n and r["mode"]=="openmp"),key=lambda r:r["mean"])
        cv=best["stddev"]/best["mean"]*100
        report.append(f"- N={n}: melhor média OpenMP com {best['threads']} threads, speedup {best['speedup']:.2f}× e variação relativa {cv:.1f}%. " + ("Houve ganho de tempo médio." if best["speedup"]>1 else "O overhead superou o ganho nesta medição."))
    report.append("\nO trabalho O(N²) das forças domina para N grande. As duas barreiras por passo, a criação da equipe, o trecho serial de E/S e a contenção de recursos limitam o ganho (Lei de Amdahl). A eficiência cai com oversubscription e com entradas pequenas. Uma diferença de médias menor que a dispersão exige mais repetições antes de concluir superioridade.\n")
    (root/"REPORT.md").write_text("\n".join(report)+"\n")

if __name__=="__main__":
    main()
