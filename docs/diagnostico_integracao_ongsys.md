# 📄 Relatório de Inquérito Técnico: Integração ONGSYS x ERPNext
**Caso**: Ausência de Entradas Automáticas no Estoque para Armazéns "Atitude" (Julho/2026)

**Data da Investigação**: 30 de Julho de 2026

**Ambientes Analisados**: GCP (`136.113.22.112`) e Hostinger VPS (`76.13.227.135`)

---

## 📌 1. Descrição do Incidente

Foi relatado que as entradas automáticas de materiais nos armazéns contendo a palavra **"ATITUDE"** via integração da API do sistema **ONGSYS** pararam de entrar no estoque do ERPNext desde o dia 14/07/2026, tanto na estrutura GCP quanto na Hostinger. Em contato com o responsável técnico pelo sistema ONGSYS, ele informou não ter localizado entradas no lado dele.

---

## 🔬 2. Metodologia do Inquérito

Executamos uma investigação técnica forense em 4 níveis:
1. **Validação de Infraestrutura e Autenticação**: Testes de requisição HTTP direta contra a API v2 do ONGSYS (`www.ongsys.com.br`) utilizando as credenciais salvas na GCP.
2. **Análise de Logs de Execução**: Inspeção do log do cron (`cron_log.txt`) e `tabError Log` no MariaDB.
3. **Auditoria de Código-Fonte**: Verificação dos filtros de negócio do extrator Python (`5_extrator_requisicoes_v2.py`).
4. **Verificação de Dados na Origem (ONGSYS)**: Consulta de paginação e inspeção do payload dos pedidos reais cadastrados no ONGSYS.

---

## 📊 3. Descobertas e Evidências Empíricas

### 🔍 3.1. Teste da Hipótese de Credenciais e Mudança de IP (GCP)
* **Hipótese**: A alteração de IP ou reinício da VM GCP poderia ter desconfigurado ou bloqueado as credenciais da API.
* **Resultado**: **FALSA**.
* **Evidência**: Testes diretos na API do ONGSYS (`https://www.ongsys.com.br/app/index.php/api/v2/produtos` e `/pedidos`) a partir da GCP confirmaram autenticação com **`HTTP 200 OK`**.

---

### 🚨 3.2. Causa Raiz Técnica #1: Tempo de Resposta da API do ONGSYS vs. Timeout do Python
* **Problema**: A API de pedidos do ONGSYS leva em média **33,53 segundos** para responder a primeira página de pedidos.
* **Falha no Código**: O arquivo `common.py` do integrador possuía o tempo limite de espera (*timeout*) fixado em **30 segundos**:
  ```python
  def ongsys_request(..., timeout: int = 30):
  ```
* **Consequência**: Em cada execução horária do `run_job.sh`, a chamada cancelava com estouro de tempo limite por apenas 3,5 segundos de diferença:
  ```text
  !!! FALHA conexão ONGSYS: HTTPSConnectionPool(host='www.ongsys.com.br', port=443): Read timed out. (read timeout=30)
  Failed to fetch records for pedidos: 503
  ```
* **Ação Corretiva Aplicada**: O parâmetro `timeout` foi atualizado de **`30s`** para **`90s`** no arquivo `/home/gt_transformadigital/scripts/cdcimplant/common.py` na GCP e no repositório.

---

### 🚨 3.3. Causa Raiz de Negócio #2: Status do Pedido no ONGSYS (`Ordem gerada` vs `Ordem finalizada`)
Após estender o *timeout* para 90s, o script conseguiu listar todos os pedidos do ONGSYS. Ao inspecionar os pedidos recentes cadastrados no ONGSYS no mês de Julho/2026, identificamos o motivo exato dos pedidos do projeto Atitude não serem convertidos em `Entrada de Material` no ERPNext.

#### Regra do Código (`5_extrator_requisicoes_v2.py`):
```python
lista_pedidos_finalizados = [
    pedido for pedido in lista_todos_pedidos
    if pedido.get("tipoPedido") == "Produto"
    and pedido.get("statusPedido") == "Ordem finalizada"
]
```

#### Amostra Real dos Pedidos no ONGSYS (Página 26 da API):

| ID do Pedido | Data no ONGSYS | Título do Pedido | Status no ONGSYS | Motivo do Descarte pelo Extrator |
| :--- | :--- | :--- | :--- | :--- |
| **`2728`** | `22/07/2026` | *02. Pedido do Atitude - INTENSIVO CABO - Container de Lixo* | 🟡 **`Ordem gerada`** | Descartado (espera `Ordem finalizada`) |
| **`2734`** | `23/07/2026` | *PEDIDO ATITUDE - BREVE JABOATÃO - MATERIAL PEDAGÓGICO* | 🟡 **`Ordem gerada`** | Descartado (espera `Ordem finalizada`) |
| **`2735`** | `27/07/2026` | *UTENSILIOS DE COZINHA - ATITUDE REC INT MULHER* | 🟡 **`Ordem gerada`** | Descartado (espera `Ordem finalizada`) |

> 💡 **Conclusão de Negócio**: Todos os pedidos recentes do projeto Atitude no ONGSYS foram registrados com o status **`Ordem gerada`**. Como o robô de integração foi programado para puxar **apenas** ordens com status **`Ordem finalizada`**, ele ignora esses pedidos até que sejam finalizados.

---

### ⚠️ 3.4. Causa Raiz de Cadastro #3: Armazéns Desativados no Banco de Dados
Ao consultar a tabela `tabWarehouse` no MariaDB do ERPNext, observou-se que os armazéns principais dos projetos Atitude (mapeados no arquivo `centro_de_custo_armazen.csv`) estavam marcados com `disabled = 1` (Desativados).

* **Nota**: Os sub-armazéns do tipo `DESPESAS DIRETAS` (ex: `CAB ATITUDE II.I - DESPESAS DIRETAS - BREVE - C`) permanecem ativos (`disabled = 0`).

---

## 🛠️ 4. Recomendações e Procedimentos de Solução

1. **Ação no ONGSYS (Operacional)**:
   - A equipe gestora do ONGSYS deve concluir o fluxo dos pedidos e alterar o status de **`Ordem gerada`** para **`Ordem finalizada`**.
   - Assim que a alteração for salva no ONGSYS, a rotina horária do `run_job.sh` irá gerar a `Entrada de Material` no ERPNext automaticamente.

2. **Ação Técnica Alternativa (Caso desejem importar ordens pendentes)**:
   - Se a instituição desejar que ordens em status `"Ordem gerada"` também deem entrada no estoque do ERPNext, basta alterar o filtro no arquivo `5_extrator_requisicoes_v2.py`:
     ```python
     # Permitir tanto 'Ordem finalizada' quanto 'Ordem gerada'
     and pedido.get("statusPedido") in ["Ordem finalizada", "Ordem gerada"]
     ```

---

*Relatório elaborado e verificado com dados empíricos do ambiente de produção.*
