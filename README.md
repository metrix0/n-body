# N-body: simulação gravitacional com OpenMP

Implementação do **Problema C da Maratona de Programação Paralela 2022**. A versão paralela divide os corpos entre threads, mantém a ordem das somas do código original e preserva seu formato binário de entrada e saída.

- [Enunciado original](https://github.com/hpc-fci-mackenzie/mpp/blob/master/22/problemset.pdf)
- [Pacote sequencial fornecido](https://github.com/hpc-fci-mackenzie/mpp/blob/master/22/nbody.zip)
- [Resultados medidos e discussão](results/REPORT.md)
- [Execuções brutas em CSV](results/runs.csv)
- [Ambiente, amostras, hashes e médias em JSON](results/benchmark.json)

## Compilação e execução

Requisitos: Linux x86-64 little-endian, GCC com OpenMP, Make, Python 3. Node.js 20+ é necessário apenas para o site e seus testes.

```sh
make
./build/original < reference/input > original.bin
./build/sequential < reference/input > sequential.bin
OMP_PROC_BIND=close OMP_PLACES=cores ./build/parallel --threads 4 < reference/input > parallel.bin
cmp original.bin sequential.bin
cmp sequential.bin parallel.bin
```

A entrada fornecida tem 65.536 corpos e exige bastante processamento. Para uma verificação rápida, use `make test`, que cria entradas menores em memória. Para gerar seu próprio arquivo:

```sh
python3 -c 'import sys; sys.path.insert(0,"scripts"); from test import dataset; sys.stdout.buffer.write(dataset(4096))' > input.bin
./build/parallel --threads 4 < input.bin > output.bin
```

Entrada: inteiro de 32 bits N, seguido de N registros de seis float32 (x, y, z, vx, vy, vz). Saída: somente os N registros, sem repetir N, como no original. Os wrappers validados aceitam N entre 1 e 1.000.000; a complexidade quadrática torna entradas grandes caras. Rejeitam arquivos truncados, bytes extras e valores não finitos. Preservam a saída binária em stdout e publicam o tempo do kernel como JSON em stderr.

O padrão é **10 passos**, Δt = **0,01** e softening = **10⁻⁹**, sem alterar a equação original. As duas versões instrumentadas aceitam `--steps N`; o original permanece intacto.

## Problema e custo sequencial

Todos os corpos têm massa unitária implícita e interagem com todos os demais. Para cada corpo i, o código acumula a contribuição dos N corpos, atualiza a velocidade e depois integra a posição usando a velocidade nova (Euler semi-implícito).

O cálculo das forças custa **O(N²) por passo**. Integração e armazenamento custam O(N); a memória também é O(N). O laço interno de forças, incluindo raiz quadrada e divisão, domina o tempo. Não há aproximação Barnes–Hut, alteração de precisão nem redução da quantidade de trabalho.

## Estratégia paralela

`src/sequential.c` inclui e reutiliza a função de forças do arquivo original. A instrumentação mede o kernel e acrescenta leitura defensiva, sem reescrever o algoritmo de referência.

`src/parallel.c` mantém uma equipe OpenMP durante todos os passos e distribui o laço externo com `schedule(static)`. Cada thread escreve apenas nas velocidades do seu corpo; posições são apenas lidas nessa fase. A barreira implícita garante que nenhuma posição seja alterada enquanto outra thread ainda calcula forças. Um segundo `omp for` atualiza posições e sua barreira prepara o próximo passo.

Cada corpo faz o mesmo número de interações, portanto a divisão estática oferece carga uniforme. Não há locks, atomics nem redução compartilhada. As variáveis da força são locais. A ordem do laço j permanece igual ao original. `-ffp-contract=off` evita que contrações FMA alterem o arredondamento. Não usamos `-ffast-math`.

A equipe persistente evita recriar threads a cada passo, mas sua criação inicial e as duas barreiras por passo entram no tempo medido. Há possível false sharing nas fronteiras dos blocos; o particionamento contíguo limita essas fronteiras.

## Validação

```sh
make test
npm install --ignore-scripts
npm test
npx playwright install chromium
npm run build
npm run test:browser
```

Os testes em C comparam **byte a byte** o original, o wrapper sequencial e OpenMP com 1, 2, 4 e 8 threads. Cobrem entradas com 1, 2, 3, 17, 63 e 128 corpos, corpos coincidentes, divisões não uniformes, variações do número de passos, entradas inválidas e opções inválidas. Os benchmarks conferem o SHA-256 de toda saída antes de aceitar seu tempo.

Os testes JavaScript verificam determinismo, particionamento, softening, estatísticas e equivalência do espelho float32 com a versão C. Os testes Playwright cobrem dados nativos, gráficos, filtros, simulação, pausa/reset, benchmark real de cinco repetições, exportação, cancelamento, ausência de dados e layout móvel.

Os fluxos do GitHub Actions publicam os estados em `results/native-status.json` e `results/web-status.json`, além das capturas de tela em `results/screenshots/`. O campo `commit` identifica exatamente o código testado. Um status antigo não valida alterações posteriores.

## Metodologia

```sh
make benchmark
python3 scripts/benchmark.py --sizes 256,1024,4096,8192 --repeats 5
```

Para cada N, mede-se o sequencial e OpenMP com **1, 2, 4 e 8 threads**. Cada configuração recebe uma execução de aquecimento e pelo menos cinco repetições válidas. A ordem das configurações é embaralhada deterministicamente em cada rodada. As entradas sintéticas usam distribuição uniforme [-1, 1] e seed 42, com seus hashes publicados.

O tempo usa `CLOCK_MONOTONIC` e cobre somente a simulação, incluindo criação da equipe e sincronização. Leitura, escrita e alocação ficam fora de ambas as versões. Os subprocessos executam separadamente; não há competição intencional entre as versões durante a medição.

A média é aritmética; o desvio padrão é amostral (divisor R−1). **Speedup = Tseq/Tp** e **eficiência = speedup/p**. O baseline de cada tamanho é a versão sequencial, compilada com as mesmas flags. OpenMP com uma thread mede o custo do runtime. Configurações que excedem a afinidade/quota de CPU são marcadas como oversubscribed.

O relatório gerado registra CPU, CPUs lógicas, afinidade, memória, sistema, compilador, flags e variáveis OpenMP. Os gráficos mostram tempo, speedup e eficiência. Todos os números são obtidos das amostras brutas, sem descartar resultados desfavoráveis.

## Resultados e limitações

Consulte [a tabela, os três gráficos e a discussão gerados](results/REPORT.md). O ambiente de CI é compartilhado; ganhos dependem dos núcleos realmente disponíveis, frequência, carga e tamanho de N. CPUs lógicas não equivalem a núcleos físicos exclusivos. Desvio padrão elevado ou diferença pequena exige mais rodadas.

A Lei de Amdahl limita o ganho total: E/S permanece serial e é excluída da medição do kernel, então speedup de kernel não deve ser apresentado como speedup do programa inteiro. Barreiras, criação da equipe, acesso à memória e escalonamento restringem a escalabilidade. Mais threads podem piorar o desempenho, principalmente com entradas pequenas ou oversubscription. O integrador e o modelo simplificado são os do exercício; não se trata de um simulador astronômico de alta precisão.

## Demonstração web e Vercel

```sh
npm install --ignore-scripts
npm run build
python3 -m http.server 4173 --directory dist
```

O deploy Vercel publica `dist/`, conforme `vercel.json`. O site não exige API, banco ou segredos. Usa Canvas com projeção 3D, controles de câmera, alternância 2D/3D e duas simulações com condições iniciais idênticas. Não há serviços externos de rastreamento.

**O navegador usa Web Workers, não OpenMP.** A tela identifica essa distinção. A visualização avança os dois estados juntos e não simula ganho artificial pela velocidade da animação. O benchmark local executa as versões separadamente, alterna sua ordem, faz aquecimento e cinco repetições de dez passos, inclui cópia/comunicação e publica erro, média, desvio, speedup e eficiência. A criação dos workers fica fora após o aquecimento. O usuário pode exportar o JSON.

As medições C são carregadas dos arquivos gerados no runner. O site mostra claramente estados pendentes ou indisponíveis e nunca preenche resultados com números demonstrativos.

## Contribuições

A lista de integrantes e sua divisão efetiva de trabalho ainda precisam ser confirmadas pelo grupo antes da entrega. Não há atribuição fictícia de autoria ou de tarefas nesta versão.

| Participação registrada | Atividade |
|---|---|
| João Vitor Almeida | Escolha do tema, definição do escopo e solicitação da implementação e da demonstração. |
| Implementação assistida nesta sessão | Código, automação de testes, benchmarks, interface e documentação; registro em [docs/uso-de-llm.md](docs/uso-de-llm.md). |
| Demais integrantes | Não informados. |

Cada integrante deve revisar, executar e compreender o que apresentar. A arguição dura 15 minutos, deve ser agendada após a entrega e ocorrer até 07/12/2026. A confirmação do grupo e do problema ao docente tem prazo em 17/11/2026. Este repositório não comprova reserva do tema nem que ele não tenha sido trabalhado em aula.

## Origem

O diretório `reference/` preserva integralmente o pacote original. A origem e os hashes do arquivo importado estão em `reference/provenance.json`. Não se presume licença para material de terceiros além das permissões concedidas por seus autores.
