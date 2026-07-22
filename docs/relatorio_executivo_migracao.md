# Relatório Executivo: Migração e Segurança do NextERP (CDC)

Este documento foi elaborado em linguagem de negócios (não-técnica) para apresentar a diretores, gestores e partes interessadas os avanços, os riscos mitigados e os próximos passos da migração do sistema de estoque do NextERP da Google Cloud (GCP) para a Hostinger.

---

## 📌 Sumário Executivo

*   **O Projeto**: Estamos transferindo o sistema NextERP (estoque) da Google Cloud para a Hostinger para reduzir custos mensais e melhorar o desempenho.
*   **O Desafio**: O sistema antigo foi implementado sem documentação técnica, com integrações ocultas e senhas frágeis.
*   **O Resultado de Hoje**: Concluímos com sucesso a fase de testes em laboratório. Provamos que a nossa cópia de segurança (backup) funciona 100% e que o sistema está pronto para ser implantado na nova casa (Hostinger) com risco quase zero de perda de dados.

---

## 1. Etapa 1: A "Perícia" no Servidor Antigo (GCP)
Antes de mover o sistema, precisamos entender como ele foi construído pela equipe anterior. Foi realizada uma investigação detalhada no servidor antigo onde descobrimos:
*   **A "Fronteira" com Parceiros**: O sistema conversa de hora em hora com um sistema parceiro externo chamado **ONGSYS** para sincronizar produtos e requisições. Mapeamos essa conexão para garantir que ela não quebre na mudança.
*   **Rotinas Ocultas**: Descobrimos scripts automáticos que enviavam cópias de segurança (backups) para uma conta do Google Drive que pertencia ao desenvolvedor antigo, e não à CDC.

<p align="center"><img src="/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase1_mapeamento.png" width="300" alt="Fase 1: Mapeamento" /></p>

---

## 2. Etapa 2: A Cópia de Segurança (Backup)
Geramos uma cópia completa de todas as informações da CDC (banco de dados com as transações e todos os arquivos anexados por usuários).
*   **Nomeação Limpa**: Organizamos os arquivos com nomes simples e fáceis de ler (ex: Banco de Dados de Produção, Arquivos Públicos, etc.) para que qualquer membro futuro da TI da CDC saiba exatamente o que é cada arquivo.

<p align="center"><img src="/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase2_backups.png" width="300" alt="Fase 2: Backups" /></p>

---

## 3. Etapa 3: O Laboratório de Testes (Simulação Local)
Para evitar que o sistema da empresa pare ou que percamos dados de estoque durante a migração, criamos um **ambiente de testes idêntico ao real** no computador local de desenvolvimento. 

Durante essa simulação, encontramos e resolvemos 3 problemas que teriam derrubado o sistema se tivéssemos feito a migração direto na Hostinger:
1.  **Conflito de Portas**: O sistema tentou usar uma porta de rede que já estava ocupada por outro aplicativo. Ajustamos o sistema para usar um canal livre.
2.  **Arquivos Incompatíveis**: Os scripts copiados do servidor antigo continham links internos que só funcionavam no servidor antigo. Atualizamos e adaptamos esses arquivos.
3.  **Senhas Desalinhadas**: Havia uma divergência entre a senha cadastrada no banco de dados e a senha de segurança do sistema, o que causava um erro de "Acesso Negado". Sincronizamos as senhas e o acesso foi liberado.

**Resultado do Teste**: A integração com o ONGSYS rodou localmente e sincronizou **100% dos dados com sucesso**. Isso nos dá a garantia de que o backup está saudável.

<p align="center"><img src="/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase3_laboratorio.png" width="300" alt="Fase 3: Laboratorio" /></p>

---

## 4. Por que esse processo é demorado e importante?
Garantir o funcionamento em um "Laboratório" antes de publicar o sistema oficial protege a CDC contra:
*   **Interrupção nas Operações (Downtime)**: Evita que os funcionários fiquem parados sem conseguir registrar entradas e saídas de estoque.
*   **Perda de Informações**: Garante que nenhuma transação ou anexo seja apagado no processo.
*   **Refação**: Resolver problemas em ambiente de teste leva minutos; resolver problemas com o sistema em produção sob pressão de usuários parados pode levar horas ou dias.

---

## 5. O que falta fazer? (Cronograma da Virada Final)
A virada do sistema para a Hostinger será dividida em etapas planejadas para causar o menor impacto possível:

| Etapa | O que será feito | Impacto na CDC |
| :--- | :--- | :---: |
| **Preparação** | Configurar o novo servidor da Hostinger e enviar os arquivos de teste. | Nenhum (sistema segue ativo no GCP) |
| **Congelamento** | Ativar o "modo manutenção" no sistema antigo (GCP) para que ninguém insira novos dados e extrair o banco de dados final atualizado. | **Downtime Temporário** (30 a 45 minutos fora do ar) |
| **Ativação** | Importar os dados finais na Hostinger e atualizar o domínio (`estoque.cdc.org.br`). | Fim do Downtime |
| **Conclusão** | Configurar os novos backups e os alertas de segurança. | Nenhum (sistema já ativo na Hostinger) |

<p align="center"><img src="/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase4_implantacao.png" width="300" alt="Fase 4: Implantacao" /></p>

---

## 6. Propostas de Melhoria Contínua (Próximos Passos de TI)
Após a migração, sugerimos implementar melhorias de governança na CDC:
1.  **Central de Backups da CDC (Rclone)**: Configurar uma ferramenta profissional (Rclone) para enviar os backups de todos os sistemas da CDC (ERPNext, Moodle, etc.) para um **Drive Compartilhado oficial da empresa**, impedindo a perda de backups se um colaborador sair da equipe.
2.  **Segurança de Senhas**: Substituir as senhas padrões expostas (como "admin") por chaves criptográficas fortes e ocultas.
3.  **Velocidade de Integração**: Otimizar o script de sincronização de produtos para rodar de forma mais veloz (atualmente ele leva 4 minutos por rodada).

---

## Anexo A: Tendências de Modernização de Estoque e ERPNext (2026)

Este anexo consolida as notícias e inovações mais recentes datadas do início de **2026** sobre a evolução do ERPNext no controle de estoques e cadeias de suprimentos globais, servindo de embasamento estratégico para a diretoria.

### 1. Lançamento do ERPNext Versão 16 (Janeiro de 2026)
*   **Performance para Grandes Volumes**: A nova versão do framework introduziu um mecanismo de consulta de banco de dados totalmente reestruturado. Isso permite que empresas que gerenciam múltiplos armazéns descentralizados (como a CDC) realizem buscas de saldo de estoque em tempo real com maior velocidade e menor consumo de servidor.
*   **Importação Inteligente de Dados**: O novo importador do ERPNext agora detecta dados inválidos ou incompatíveis antes de inseri-los no banco e permite importar árvores completas de "Grupos de Itens" e "Armazéns" de uma só vez, reduzindo o tempo de setup administrativo.

### 2. Sincronização e Rastreabilidade Avançada de Inventário (Atualizações de 2026)
*   **Reserva Inteligente de Estoque**: O ERPNext v16 aprimorou a capacidade de realizar reservas de produtos associados a "Combos/Kits" (Product Bundles), garantindo que itens individuais não fiquem em falta em vendas casadas.
*   **Gestão de Dropshipping Otimizada**: Foi implementado o suporte a entregas parciais diretamente na Ordem de Compra de fornecedores integrados, facilitando o controle com parceiros de distribuição sem planilhas externas paralelas.
*   **Relatório de Envelhecimento de Estoque (Stock Ageing)**: O relatório chave de auditoria foi totalmente refatorado para alinhar perfeitamente os valores em lote com o livro-razão financeiro, aumentando a precisão de auditorias contábeis de estoque.

### 3. O ERPNext como Alternativa Tecnológica Soberana
No cenário corporativo de 2026, o ERPNext e o Frappe Framework consolidaram-se como as principais escolhas Open Source para substituir sistemas proprietários caros (como SAP e Totvs). A ausência de custos por usuário (licenciamento) permite que instituições invistam recursos financeiros diretamente na otimização de suas regras de negócios locais e segurança da informação, em vez de taxas de software recorrentes.

