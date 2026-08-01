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
