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

![Fase 1: Mapeamento e Perícia de Sistemas](/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase1_mapeamento.png)

---

## 2. Etapa 2: A Cópia de Segurança (Backup)
Geramos uma cópia completa de todas as informações da CDC (banco de dados com as transações e todos os arquivos anexados por usuários).
*   **Nomeação Limpa**: Organizamos os arquivos com nomes simples e fáceis de ler (ex: Banco de Dados de Produção, Arquivos Públicos, etc.) para que qualquer membro futuro da TI da CDC saiba exatamente o que é cada arquivo.

![Fase 2: Coleta de Backups e Arquivos](/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase2_backups.png)

---

## 3. Etapa 3: O Laboratório de Testes (Simulação Local)
Para evitar que o sistema da empresa pare ou que percamos dados de estoque durante a migração, criamos um **ambiente de testes idêntico ao real** no computador local de desenvolvimento. 

Durante essa simulação, encontramos e resolvemos 3 problemas que teriam derrubado o sistema se tivéssemos feito a migração direto na Hostinger:
1.  **Conflito de Portas**: O sistema tentou usar uma porta de rede que já estava ocupada por outro aplicativo. Ajustamos o sistema para usar um canal livre.
2.  **Arquivos Incompatíveis**: Os scripts copiados do servidor antigo continham links internos que só funcionavam no servidor antigo. Atualizamos e adaptamos esses arquivos.
3.  **Senhas Desalinhadas**: Havia uma divergência entre a senha cadastrada no banco de dados e a senha de segurança do sistema, o que causava um erro de "Acesso Negado". Sincronizamos as senhas e o acesso foi liberado.

**Resultado do Teste**: A integração com o ONGSYS rodou localmente e sincronizou **100% dos dados com sucesso**. Isso nos dá a garantia de que o backup está saudável.

![Fase 3: Laboratório e Simulação Local](/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase3_laboratorio.png)

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

![Fase 4: Implantação Hostinger e Virada Definitiva](/home/vier/Documentos/Code/CDC/NextERP/docs/images/fase4_implantacao.png)

---

## 6. Propostas de Melhoria Contínua (Próximos Passos de TI)
Após a migração, sugerimos implementar melhorias de governança na CDC:
1.  **Central de Backups da CDC (Rclone)**: Configurar uma ferramenta profissional (Rclone) para enviar os backups de todos os sistemas da CDC (ERPNext, Moodle, etc.) para um **Drive Compartilhado oficial da empresa**, impedindo a perda de backups se um colaborador sair da equipe.
2.  **Segurança de Senhas**: Substituir as senhas padrões expostas (como "admin") por chaves criptográficas fortes e ocultas.
3.  **Velocidade de Integração**: Otimizar o script de sincronização de produtos para rodar de forma mais veloz (atualmente ele leva 4 minutos por rodada).
