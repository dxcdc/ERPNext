# Documentação de Transição: Repositórios e Histórico da Equipe Antiga

Este documento serve como registro histórico dos repositórios, códigos e ativos de infraestrutura desenvolvidos pela equipe anterior para o NextERP (CDC). Ele garante que todas as origens históricas fiquem registradas e acessíveis para consultas futuras.

---

## 🔗 Repositórios e Links Antigos

### 1. Integrador / Extrator de Dados (`cdcimplant`)
*   **Repositório Original**: `https://github.com/rojefferson/cdcimplant`
*   **Branch Utilizada**: `main`
*   **Descrição**: Script em Python que faz a ponte de integração de dados entre as APIs do ONGSYS e o ERPNext da CDC.
*   **Último Commit Mapeado (Julho/2026)**: A branch local estava sincronizada com a `origin/main` do repositório da equipe anterior.

### 2. Automação de Backups (`scripts_backup`)
*   **Estado**: **Sem repositório Git**.
*   **Credenciais GCP**: **Confirmadas como propriedade da CDC**. O projeto GCP Console (`cdc-org`) possui as credenciais OAuth 2.0 (`Backup-ERP`) e a Conta de Serviço (`backup-erp@cdc-org.iam.gserviceaccount.com`).
*   **Descrição**: Os scripts de backup (`bkp.py`, `gerar_token.py`, `token.pickle`, `client_secret_(1).json`) rodavam diretamente no host da VM GCP, sem controle de versão. Eles foram coletados, compactados e agora estão salvos e versionados no repositório da CDC.

---

## 🛡️ Análise de Riscos e Impacto de Deleção

> [!IMPORTANT]
> **Risco de Deleção pela Equipe Antiga**: **NULO (0%)**
> 
> Caso a equipe anterior exclua, torne privado ou altere o repositório `https://github.com/rojefferson/cdcimplant` no GitHub, **nossa operação não sofrerá nenhum impacto**. 

### Ações de Proteção Executadas:
1.  **Consolidação de Código**: O código-fonte completo do Extrator de Dados foi copiado e integrado de forma nativa no nosso repositório de infraestrutura na pasta **`extractor/`**.
2.  **Desacoplamento de Histórico**: A pasta de versionamento oculta `.git` vinculada ao repositório antigo foi excluída localmente. 
3.  **Versionamento Próprio**: Todo o código do extrator e os scripts de backup agora são de propriedade e controle direto da CDC sob o novo repositório **`git@github.com:dxcdc/ERPNext.git`**.

---

## 🗄️ Procedimento para Resgate em Caso de Emergência

Caso seja necessário restaurar os arquivos originais exatamente como estavam no servidor GCP antes das nossas modificações de laboratório:

1.  **Arquivos de Backup e Scripts Brutos**:
    Os pacotes compactados originais baixados da produção GCP estão armazenados localmente na pasta:
    *   `backups/extractor_scripts.tar.gz` (contendo o código bruto do extrator com histórico Git legado).
    *   `backups/backup_scripts.tar.gz` (contendo os scripts do Google Drive e token OAuth original).
2.  **Como extrair os arquivos brutos legados**:
    ```bash
    # Para extrair os scripts do extrator legado
    tar -xzf backups/extractor_scripts.tar.gz -C /caminho/de/destino/
    
    # Para extrair a automação de backup do drive original
    tar -xzf backups/backup_scripts.tar.gz -C /caminho/de/destino/
    ```
