# Registro de uso de LLM

Ferramenta: ChatGPT / Codex, família GPT-6. Uso em 16/11/2026.

Finalidades: análise do código sequencial fornecido, implementação OpenMP, instrumentação, testes de correção, metodologia de benchmark, interface de demonstração, documentação e revisão dos resultados. As medições são produzidas por executáveis no runner e não por estimativas da LLM.

## Solicitação de escolha do problema

> great. pick a theme for me

A escolha proposta foi N-body, Problema C de 2022, com OpenMP, a partir do repositório indicado pelo docente.

## Solicitação de implementação

```text
Ok, do the implementation perfectly, having in mind the initial message I sent, the example code, etc...

- Leave no traces of AI, no AI weird comments etc
- Make it as if a human did it
- Commit to /n-body repo, it's deploying in Vercel
- Deploy to Vercel a live simulation of before vs after, with analytics, etc. And maybe the 3d thing if it makes sense.
- The data must be clear that the new version is better
```

O enunciado da disciplina exige declarar uso de LLM e documentar os prompts. Por isso, este registro é mantido. Os resultados favoráveis ou desfavoráveis são apresentados conforme medidos.

## Requisitos do enunciado usados como contexto

Paralelizar a aplicação com Pthreads, OpenMP ou MPI a partir da versão sequencial; entregar ambas as versões, compilação e execução; descrever custo, decomposição, sincronização e balanceamento; registrar ambiente; executar ao menos cinco repetições; publicar média, desvio padrão, tempo, speedup e eficiência; discutir gargalos e Lei de Amdahl; indicar a contribuição real de cada integrante.

Não houve declaração de contribuição de outros integrantes nem fabricação de benchmarks. Antes da entrega, o grupo precisa confirmar seus membros, revisar o material e atualizar a divisão de trabalho conforme a participação efetiva.
