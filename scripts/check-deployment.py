import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

repo=os.environ["GITHUB_REPOSITORY"]
sha=os.environ["GITHUB_SHA"]
def github(path):
    req=urllib.request.Request("https://api.github.com/repos/"+repo+path,headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})
    with urllib.request.urlopen(req,timeout=30) as response:
        return json.load(response)
def public(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"n-body-deployment-check"}),timeout=30) as response:
        return response.read(), dict(response.headers)

report={"commit":sha,"checked_at":datetime.now(timezone.utc).isoformat(),"verified":False}
error=""
for attempt in range(30):
    try:
        deployments=github("/deployments?sha="+sha+"&per_page=20")
        for deployment in deployments:
            statuses=github("/deployments/"+str(deployment["id"])+"/statuses")
            for status in statuses:
                url=status.get("environment_url","")
                if status.get("state")!="success" or not url:
                    continue
                parsed=urllib.parse.urlsplit(url)
                if parsed.scheme!="https" or not (parsed.hostname or "").endswith(".vercel.app"):
                    continue
                base=url.rstrip("/")
                html,headers=public(base+"/")
                assert b"Veja o trabalho acontecer." in html and b"canvas-seq" in html and b"app.js" in html
                data,_=public(base+"/data/benchmark.json")
                benchmark=json.loads(data)
                assert benchmark["schema"]==1 and benchmark["rows"] and all(r["repeats"]>=5 for r in benchmark["rows"])
                js,_=public(base+"/app.js")
                assert b"Pool" in js and b"loadNative" in js
                css,_=public(base+"/style.css")
                assert b".simulation-grid" in css
                report.update(verified=True,url=base,github_deployment_id=deployment["id"],native_source_commit=benchmark["source_commit"],headers={"content-security-policy":headers.get("Content-Security-Policy",headers.get("content-security-policy"))})
                break
            if report["verified"]:
                break
        if report["verified"]:
            break
        error="No successful public Vercel deployment with this commit was available yet."
    except Exception as exc:
        error=str(exc)
    time.sleep(10)
report["note"]=error if not report["verified"] else "HTML, JavaScript, CSS and real benchmark data verified on the deployed URL."
root=Path("results");root.mkdir(exist_ok=True)
(root/"deployment.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report))
if not report["verified"]:
    raise SystemExit(1)
