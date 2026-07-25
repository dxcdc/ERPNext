import frappe

@frappe.whitelist()
def get_stock_dashboard_data():
    """
    Retorna métricas em tempo real para o Painel Executivo do Estoque:
    1. Movimentações por Dia da Semana (Seg, Qua, Sex) com Entradas e Saídas
    2. Composição 100% Empilhada por Categoria de Item
    3. Distribuição por Cidade / Unidade Física
    """
    # 1. Mês atual: Entradas vs Saídas
    receipts_month = frappe.db.count('Stock Entry', {'purpose': 'Material Receipt', 'docstatus': 1, 'posting_date': ['>=', '2026-07-01']})
    issues_month = frappe.db.count('Stock Entry', {'purpose': 'Material Issue', 'docstatus': 1, 'posting_date': ['>=', '2026-07-01']})
    
    total_qty = frappe.db.sql("SELECT SUM(actual_qty) FROM tabBin")[0][0] or 0
    total_items = frappe.db.count("Item", {"disabled": 0})
    
    # 2. Categorias (Top 4 + Outros)
    categories = frappe.db.sql("""
        SELECT i.item_group, COUNT(*) as cnt 
        FROM tabItem i 
        WHERE i.disabled = 0 
        GROUP BY i.item_group 
        ORDER BY cnt DESC
    """, as_dict=True)
    
    total_cat_items = sum(c['cnt'] for c in categories) or 1
    top_categories = []
    others_cnt = 0
    
    colors = ["#4361ee", "#111827", "#06b6d4", "#e2e8f0", "#10b981", "#f59e0b"]
    
    for idx, cat in enumerate(categories):
        if idx < 4:
            pct = round((cat['cnt'] / total_cat_items) * 100, 1)
            top_categories.append({
                "label": cat['item_group'],
                "count": cat['cnt'],
                "percent": pct,
                "color": colors[idx % len(colors)]
            })
        else:
            others_cnt += cat['cnt']
            
    if others_cnt > 0:
        pct = round((others_cnt / total_cat_items) * 100, 1)
        top_categories.append({
            "label": "Outras Categorias",
            "count": others_cnt,
            "percent": pct,
            "color": colors[4]
        })
        
    # 3. Cidades / Unidades
    cities_query = frappe.db.sql("""
        SELECT 
            COALESCE(NULLIF(w.parent_warehouse, ''), 'Sem Unidade') as cidade,
            COUNT(w.name) as total_armazens
        FROM tabWarehouse w
        WHERE w.is_group = 0
        GROUP BY cidade
        ORDER BY total_armazens DESC
    """, as_dict=True)
    
    formatted_cities = []
    for c in cities_query:
        name = c['cidade'].replace(': ATITUDE - C', '').replace(' - C', '').strip()
        formatted_cities.append({
            "city": name,
            "warehouses": c['total_armazens']
        })
        
    return {
        "receipts_month": receipts_month,
        "issues_month": issues_month,
        "total_qty": round(total_qty, 2),
        "total_items": total_items,
        "categories": top_categories,
        "cities": formatted_cities
    }
