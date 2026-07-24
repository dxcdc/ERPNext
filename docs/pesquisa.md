# Pesquisa Expandida de Inovações, Melhores Práticas e Integrações: NextERP (CDC)
### Panorâmica de 3 Anos do Ecossistema Frappe/ERPNext (2024 – 2026)

Este documento consolida uma investigação ampla sobre a evolução tecnológica, projetos comunitários, postagens no LinkedIn, discussões no fórum oficial (`discuss.frappe.io`) e cases da indústria cobrindo os últimos **3 anos (2024, 2025 e 2026)**.

---

## 📌 Sumário Geral

1. [Linha do Tempo e Evolução do Ecossistema (2024 - 2026)](#1-linha-do-tempo-e-evolução-do-ecossistema-2024---2026)
   * 1.1 [2024: Frappe Framework v15 & Desacoplamento de Módulos](#11-2024-frappe-framework-v15--desacoplamento-de-módulos)
   * 1.2 [2025: Automação Componível, Frappe UI (Vue 3) & BI Integrado](#12-2025-automação-componível-frappe-ui-vue-3--bi-integrado)
   * 1.3 [2026: ERPNext v16, Era Agêntica (Agentic AI) & Frappe Caffeine](#13-2026-erpnext-v16-era-agêntica-agentic-ai--frappe-caffeine)
2. [Grandes Pilares Tecnológicos & Inovações Práticas](#2-grandes-pilares-tecnológicos--inovações-práticas)
   * 2.1 [Frappe UI (Vue 3 + TailwindCSS) & Aplicações PWA para Estoque](#21-frappe-ui-vue-3--tailwindcss--aplicações-pwa-para-estoque)
   * 2.2 [Integração Nativa com o Chat Mattermost (ChatOps & Alertas)](#22-integração-nativa-com-o-chat-mattermost-chatops--alertas)
   * 2.3 [Automação com IA Generativa, OCR e Leitura de Documentos](#23-automação-com-ia-generativa-ocr-e-leitura-de-documentos)
   * 2.4 [Central de Backups Offsite (Rclone + Criptografia GPG 3-2-1)](#24-central-de-backups-offsite-rclone--criptografia-gpg-3-2-1)
   * 2.5 [Acessibilidade, Usabilidade e Personalização Visual (UI/UX)](#25-acessibilidade-usabilidade-e-personalização-visual-uiux)
   * 2.6 [Módulo de Treinamento, Sandbox e Capacitação de Colaboradores](#26-módulo-de-treinamento-sandbox-e-capacitação-de-colaboradores)
3. [Como Aplicar o Frappe UI (Vue 3 + Tailwind) Agora Mesmo na CDC](#3-como-aplicar-o-frappe-ui-vue-3--tailwind-agora-mesmo-na-cdc)
4. [Matriz de Viabilidade e Roadmap de Implementação para a CDC](#4-matriz-de-viabilidade-e-roadmap-de-implementação-para-a-cdc)

---

## 1. Linha do Tempo e Evolução do Ecossistema (2024 - 2026)

### 1.1 2024: Frappe Framework v15 & Desacoplamento de Módulos
*   **Frappe v15 Release**: Introdução do suporte nativo a temas (Dark/Light), novo construtor visual de formulários (*Form Builder*) e refatoração da arquitetura de permissões.
*   **Desacoplamento do Core**: Abertura da estratégia de separar recursos legados do núcleo do ERPNext em aplicativos independentes (ex: *Frappe HR* para RH, *Frappe LMS* para treinamentos e *Frappe Health*).
*   **Melhoria de Performance SQL**: Otimização de consultas em grandes volumes de lançamentos e eliminação de *deadlocks* em bancos MariaDB 10.6.

### 1.2 2025: Automação Componível, Frappe UI (Vue 3) & BI Integrado
*   **Consolidação do Frappe UI (Vue 3 + Tailwind)**: Formato oficial recomendado para a construção de portais públicos, aplicativos móveis PWA e painéis operacionais sem depender do Desk tradicional.
*   **Frappe Insights (Business Intelligence)**: Ferramenta nativa de BI e análise de dados integrada diretamente ao banco do ERPNext, permitindo relatórios em tempo real sem exportações manuais.
*   **Frappe Builder & Drive**: Lançamento do construtor de sites sem código (*Frappe Builder*) e da nuvem de arquivos corporativa (*Frappe Drive*).

### 1.3 2026: ERPNext v16, Era Agêntica (Agentic AI) & Frappe Caffeine
*   **ERPNext v16 Release**: Foco em altíssimo desempenho e escalabilidade empresarial.
*   **Camada "Frappe Caffeine"**: Nova camada de cache inteligente em Redis que reduz o consumo de CPU em consultas repetitivas de saldo de estoque em até 70%.
*   **UUIDs Curtos**: Transição para identificadores primários otimizados, acelerando a indexação de tabelas com milhões de registros.
*   **Protocolo MCP (Model Context Protocol)**: Integração de agentes de Inteligência Artificial para planejamento, execução de tarefas e auditoria autônoma de dados.

---

## 2. Grandes Pilares Tecnológicos & Inovações Práticas

### 2.1 Frappe UI (Vue 3 + TailwindCSS) & Aplicações PWA para Estoque
A principal dor de operadores de almoxarifado no ERPNext tradicional é a densidade de informações em telas de computador. A comunidade superou isso criando **PWAs (Progressive Web Apps)** leves:
*   **Instalação em 1 Clique**: Funciona como um aplicativo de celular ou tablet em campo.
*   **Interface Focada em Tarefa**: Exibe apenas os botões de bipar código de barras, conferir quantidade e salvar entrada.

### 2.2 Integração Nativa com o Chat Mattermost (ChatOps & Alertas)
Permite transformar o Mattermost da CDC no hub central de comunicação e alertas operacionais:
*   **Webhooks de Movimentação**: Envio de alertas formatados no canal `#estoque` no momento em que uma requisição é aprovada.
*   **Consultas por Nome Natural**: O colaborador digita no chat `/estoque Cadeira de Rodas` ou `/estoque Cesta Básica`, e o sistema responde instantaneamente com o saldo do armazém.
*   **Notificação de Erros (`#ti-alertas`)**: Alertas automáticos para a equipe de TI em caso de falha de banco ou backup.

### 2.3 Automação com IA Generativa, OCR e Leitura de Documentos
*   **OCR + Leitura de Notas Fiscais**: Leitura automática de PDFs enviadas por fornecedores, criando a entrada de estoque em rascunho sem digitação manual.
*   **Classificação Inteligente**: Sugestão automática do Grupo de Produtos (*Item Group*) e Unidade de Medida com base no nome do produto.

### 2.4 Central de Backups Offsite (Rclone + Criptografia GPG 3-2-1)
*   Substituição de scripts manuais pelo utilitário profissional **Rclone**.
*   Criptografia assimétrica GPG em cada arquivo `.sql.gz` e `.tar` antes do upload para o Google Drive institucional da CDC.

### 2.5 Acessibilidade, Usabilidade e Personalização Visual (UI/UX)
*   **Controles de Fonte (`A+` / `A-` / `100%`)**: Botões de acessibilidade na barra superior com salvamento no navegador (`localStorage`).
*   **Alternância Rápida de Tema Escuro / Claro (`☀️/🌙`)**: Permite ajustar o tema visual conforme a iluminação do ambiente.

### 2.6 Módulo de Treinamento, Sandbox e Capacitação de Colaboradores
*   **Ambiente Sandbox Isolado**: Permite que novos funcionários e voluntários realizem testes práticos sem risco de afetar o banco oficial de produção.
*   **Guias de Integração no ERPNext**: Manuais simplificados incorporados diretamente na interface.

---

## 3. Como Aplicar o Frappe UI (Vue 3 + Tailwind) Agora Mesmo na CDC

Para implementar uma interface moderna baseada em **Frappe UI (Vue 3 + Tailwind)** no NextERP da CDC, o procedimento técnico padronizado é:

### Passo 1: Inicialização do App Customizado com a CLI do Frappe UI
No ambiente de desenvolvimento do contêiner Docker, executa-se o comando da comunidade:
```bash
npx frappe-ui-cli create app cdc_mobile
```
Isso gera a estrutura completa de um aplicativo **Vue 3 + TailwindCSS + Vite** configurado para se conectar ao backend do ERPNext.

### Passo 2: Conexão Automática via REST API Nativa (`createResource`)
O Frappe UI fornece o composable nativo `createResource`, eliminando a necessidade de escrever rotas de backend:
```javascript
import { createResource } from 'frappe-ui'

const estoque = createResource({
    url: 'frappe.client.get_list',
    params: {
        doctype: 'Item',
        fields: ['item_code', 'item_name', 'stock_uom']
    },
    auto: true
})
```

### Passo 3: Publicação da Aplicação PWA para Tablets e Celulares
Após o build (`npm run build`), o aplicativo PWA é publicado como uma página do ERPNext e pode ser acessado no navegador do celular/tablet no endereço:
`http://localhost:8085/cdc_mobile`

---

## 4. Matriz de Viabilidade e Roadmap de Implementação para a CDC

| Recurso / Inovação | Esforço | Valor para a CDC | Status / Fase |
| :--- | :---: | :---: | :---: |
| **Controles de Acessibilidade (`A+/A-`) e Tema Light Padrão** | 🟢 Baixo | 🟢 Alto | **Concluído / Ativo Local** |
| **Notificações e Alertas no Chat Mattermost** | 🟢 Baixo | 🟢 Alto | **Documentado & Pronto** |
| **Substituição por Rclone + Criptografia GPG nos Backups** | 🟡 Médio | 🟣 Crítico | **Fase 3 (Em Andamento)** |
| **Módulo de Treinamento & Base de Dados Sandbox (Issue #07)** | 🟡 Médio | 🟢 Alto | **Fase 4 (Planejado)** |
| **Aplicativo Móvel PWA em Frappe UI (Vue 3 + Tailwind)** | 🟡 Médio | 🟡 Médio | **Fase 4 (Próximo Passo)** |
| **Leitura de Notas Fiscais via OCR + IA Generativa** | 🔴 Alto | 🟡 Médio | **Estudo Futuro** |

---

### 🚀 Status dos Arquivos no Repositório:
* **[docs/pesquisa.md](file:///home/vier/Documentos/Code/CDC/NextERP/docs/pesquisa.md)**: Atualizado e expandido com o histórico de 3 anos (2024-2026), estudo do Mattermost e guia do Frappe UI.
