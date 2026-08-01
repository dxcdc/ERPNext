# Ensaio de reprodução limpa via Terraform — 2026-08-01

## Objetivo e isolamento

Foi criada uma réplica descartável a partir da receita versionada, em uma worktree e branch exclusivas, sem alterar o laboratório consolidado nem a VPS de produção.

- branch experimental: `test/reproducao-terraform-20260801`
- namespace Docker: `nexterp-repro`
- URL temporária: `http://localhost:8086`
- origem dos dados: `gcp-prod-database-latest.sql.gz`, gerado em 31/07/2026 às 20:31
- laboratório de referência: namespace `nexterp`, porta 8085
- produção: não acessada nem modificada durante o ensaio

## Resultado executivo

A primeira execução falhou de forma reproduzível. Ela revelou que a receita iniciava a restauração antes de o MariaDB aceitar autenticação e que o container configurador não encontrava o módulo `cdc_theme`. Também foi confirmado que a criação inicial do site usava um banco aleatório, enquanto a restauração esperava o banco `_5e5899d8398b5f7b`.

Após as correções, uma nova execução partindo de volumes vazios concluiu os 9 recursos do Terraform. A esteira aprovou 8 de 8 etapas e um plano imediatamente posterior retornou `No changes`, comprovando idempotência no segundo ciclo.

## Indicadores qualitativos

| Dimensão | Resultado | Evidência |
|---|---:|---|
| Reprodutibilidade da infraestrutura | 100% | 9 recursos aplicados e segundo plano sem mudanças |
| Versões da aplicação | 100% | `cdc_theme 1.0.0`, ERPNext 15.88.1 e Frappe 15.88.2 nos dois ambientes |
| Fidelidade transacional de estoque | 100% | Contagens e checksums iguais nas tabelas de lançamento, itens e razão de estoque |
| Cadastros operacionais | 100% | Armazéns, itens e saldos com contagens e checksums iguais |
| Usuários do sistema | 100% semântico | 69 identidades, habilitação, perfis e filtros iguais; somente `last_login` e `last_active` mudaram pelo uso local |
| APIs de estoque e projetos | 100% | Resposta completa idêntica nos dois ambientes |
| Pendências ONGSYS | Incompleto | 56 no laboratório e 0 na réplica limpa |
| Integridade | Aprovada | zero saldos negativos, bins órfãos, lançamentos submetidos sem itens e pendências inválidas |
| Segurança do ensaio | Atenção média | estado Terraform descartável criado inicialmente com modo de arquivo amplo |

Considerando as dimensões acima e penalizando a ausência do estado operacional das pendências, a fidelidade global observada é estimada em **92%**. O número não substitui os resultados por dimensão: o núcleo de estoque ficou fiel, enquanto a continuidade da sincronização ONGSYS ainda não ficou autônoma.

## Comparação de dados

| Conjunto | Laboratório | Réplica Terraform | Situação |
|---|---:|---:|---|
| Usuários cadastrados | 71 | 71 | Igual |
| Usuários retornados pela tela CDC | 69 | 69 | Igual |
| Lançamentos de estoque | 3.532 | 3.532 | Igual |
| Itens dos lançamentos | 62.343 | 62.343 | Igual |
| Registros do razão de estoque | 64.628 | 64.628 | Igual |
| Armazéns | 54 | 54 | Igual |
| Itens | 1.507 | 1.507 | Igual |
| Saldos por item/armazém | 3.052 | 3.052 | Igual |
| Pendências ONGSYS | 56 | 0 | Divergente |

As 56 pendências foram sincronizadas no laboratório às 21:08, depois da geração do dump às 20:31. Portanto, a divergência não indica corrupção na restauração: mostra que a tabela de pendências é um estado derivado e precisa de uma etapa pós-restauração ou de um backup posterior à sincronização.

## Correções incorporadas à receita

1. Espera autenticada do MariaDB por até 90 segundos.
2. Espera explícita e validação do término do configurador e da criação do site.
3. `PYTHONPATH` do `cdc_theme` também no configurador.
4. Nome do banco inicial alinhado ao banco restaurado.
5. Falha imediata com logs quando configurador ou criação do site terminam com erro.
6. URL do laboratório derivada da variável `http_port` e identificação da branch canônica corrigida para `main`.

## Pendências antes de considerar a reprodução plenamente autônoma

1. Executar a sincronização segura das três primeiras páginas da ONGSYS como etapa pós-restauração, preferencialmente em modo sem escrita de estoque.
2. Definir `umask 077` no procedimento que chama o Terraform ou usar backend de estado protegido; arquivos de estado podem conter informações sensíveis.
3. Corrigir, após backup e validação funcional, o armazém legado com texto corrompido já identificado nas duas bases.
4. Executar validação visual autenticada das quatro rotas CDC, pois a esteira automatizada comprova conteúdo e API, mas não substitui a inspeção do navegador.

## Critério de descarte

Após a coleta, os containers, a rede e os volumes com prefixo `nexterp-repro` devem ser removidos. Os resultados deste documento e os commits da correção permanecem no repositório; nenhum dado sensível do backup ou do estado Terraform deve ser versionado.

## Reteste após as correções

O ensaio foi repetido em um segundo namespace descartável, `nexterp-retest`, na porta 8087, partindo novamente de volumes vazios e do commit corrigido `b7076bc`.

A primeira tentativa desse reteste revelou uma condição de corrida adicional: durante a criação paralela dos containers, mais de um serviço tentou preencher o volume Docker `assets`, causando `failed to create symlink ... file exists`. A execução anterior havia passado por uma ordenação favorável e, portanto, ainda não comprovava determinismo.

A receita passou a inicializar banco, Redis e configurador primeiro. Assim, somente o configurador prepara os volumes compartilhados; os demais serviços são criados depois dessa etapa. Com essa correção:

- os 9 recursos Terraform foram aplicados integralmente;
- as 8 etapas da esteira foram aprovadas;
- o plano subsequente retornou `No changes` e código 0;
- as versões permaneceram idênticas;
- as seis tabelas centrais de estoque apresentaram contagens e checksums idênticos;
- as APIs de estoque e usuários foram semanticamente idênticas;
- não houve saldo negativo, bin órfão, lançamento submetido sem itens ou achado alto;
- a divergência das 56 pendências permaneceu, pelo mesmo motivo temporal já documentado.

O reteste mantém a fidelidade global em **92%**, pois aumentou a confiança na reprodutibilidade da infraestrutura, mas não alterou a lacuna de continuidade do estado derivado da ONGSYS. Para esse indicador subir, a sincronização segura pós-restauração precisa fazer parte da receita ou o dump deve ser capturado depois dela.

## Registro objetivo do segundo ensaio

### Identificação

| Campo | Valor |
|---|---|
| Data da auditoria final | 01/08/2026 02:48:08, America/Recife |
| Commit de partida | `b7076bc` |
| Commit da correção final | `9cd925d` |
| Namespace descartável | `nexterp-retest` |
| Porta temporária | 8087 |
| Banco | `_5e5899d8398b5f7b` |
| Site | `frontend` |
| Backup usado | `gcp-prod-database-latest.sql.gz` |
| Hash SHA-256 do backup | `11b122e3cc78bbdadca91e687a4e0b58ec39a583c7ecb0022ed28187047c26b0` |

### Tentativas

| Tentativa | Resultado | Evidência |
|---|---|---|
| Reteste inicial com `b7076bc` | Falhou | corrida ao popular `assets`: `failed to create symlink ... file exists` |
| Reteste após serialização | Aprovado | 9 recursos aplicados; pipeline 8/8 |
| Plano após aplicação | Aprovado | `No changes`, código de saída 0 |

O recurso que prepara containers e site levou 1min57s. A restauração do backup levou 1min01s, a instalação/migração do tema 1min00s e as demais fases somaram aproximadamente 1min02s. O ciclo corrigido completo levou cerca de **5 minutos**.

### Checksums das tabelas centrais

Os valores abaixo foram obtidos com `CHECKSUM TABLE` nos dois ambientes. Cada par foi idêntico.

| Tabela | Linhas | Checksum laboratório | Checksum réplica |
|---|---:|---:|---:|
| `tabStock Entry` | 3.532 | 1.934.928.668 | 1.934.928.668 |
| `tabStock Entry Detail` | 62.343 | 3.242.272.764 | 3.242.272.764 |
| `tabStock Ledger Entry` | 64.628 | 1.388.730.745 | 1.388.730.745 |
| `tabWarehouse` | 54 | 1.742.001.145 | 1.742.001.145 |
| `tabItem` | 1.507 | 2.054.296.514 | 2.054.296.514 |
| `tabBin` | 3.052 | 42.779.783 | 42.779.783 |

### Pipeline e desempenho observado

| Etapa | Resultado | Duração |
|---|---|---:|
| Workspaces e banco | Aprovada | 1,60s |
| Serviços e containers | Aprovada | 0,13s |
| Assets e servidor web | Aprovada | 0,21s |
| Estoque e projetos | Aprovada | 19,25s |
| Usuários e pendências | Aprovada | 4,61s |
| Rotas e diagnóstico | Aprovada | 4,80s |
| Livro de Inventário | Aprovada | 6,23s |
| ONGSYS e Terraform seguro | Aprovada | 4,61s |

Os tempos das APIs, incluindo a inicialização do comando Bench, foram: estoque 2,596s, usuários 2,151s e pendências 2,119s. Esses números são observações deste equipamento, não metas de desempenho para produção.

### Integridade e achados

| Verificação | Resultado |
|---|---:|
| Bins órfãos | 0 |
| Saldos negativos | 0 |
| Lançamentos submetidos sem itens | 0 |
| Pendências inválidas | 0 |
| Achados altos | 0 |
| Achados médios | 2 |

Os dois achados médios foram o armazém legado com texto corrompido e a permissão inicialmente ampla do arquivo de estado Terraform descartável. Nenhum deles alterou os dados transacionais comparados.

### Evidências brutas e descarte

Os logs brutos foram mantidos fora do Git para evitar versionar saídas potencialmente sensíveis:

| Evidência | SHA-256 |
|---|---|
| tentativa com corrida de `assets` | `bfa06a3e732ea56c7fd7cb89a79ebaeb090fafc5e4ec478fb929963c4d7bceb0` |
| aplicação corrigida | `9b0d24e81d70a4345da62ee352ff9c4392983f6410866033b8e0de6382c79fa7` |
| plano idempotente | `9ed1d3a7b74d985570a813ebb2205b33146060fef3d2037961f91a85b7e349b6` |

Após a coleta foram confirmados zero containers, zero volumes e zero redes com prefixo `nexterp-retest`. A worktree e a branch temporárias também foram removidas. O laboratório de referência permaneceu disponível na porta 8085.

## Interpretação dos percentuais

Os resultados de 100% significam igualdade nos critérios explicitamente medidos, não garantia absoluta de equivalência do sistema inteiro. A estimativa global de 92% é uma avaliação de prontidão baseada nas dimensões documentadas e penalizada pela falta da continuidade automática das pendências ONGSYS. Validação visual autenticada, teste de restauração em infraestrutura equivalente à hospedagem final e observação das rotinas agendadas continuam sendo critérios separados.
