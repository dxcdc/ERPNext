import frappe


INDEX_NAME = "uniq_stock_entry_idpedido_ongsys"


def execute():
    """Aplica idempotência no banco durante bench migrate, recusando perda de dados."""
    duplicates = frappe.db.sql("""
        SELECT COUNT(*) FROM (
            SELECT idpedido_ongsys
            FROM `tabStock Entry`
            WHERE COALESCE(idpedido_ongsys, '') <> ''
            GROUP BY idpedido_ongsys HAVING COUNT(*) > 1
        ) duplicated
    """)[0][0] or 0
    if duplicates:
        frappe.throw(
            f"Existem {duplicates} IDs ONGSYS duplicados; o índice único não foi criado."
        )

    oversized = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabStock Entry`
        WHERE CHAR_LENGTH(COALESCE(idpedido_ongsys, '')) > 140
    """)[0][0] or 0
    if oversized:
        frappe.throw(
            f"Existem {oversized} IDs ONGSYS acima de 140 caracteres; revise antes da migração."
        )

    frappe.db.sql("""
        ALTER TABLE `tabStock Entry`
        MODIFY `idpedido_ongsys` VARCHAR(140) NULL
    """)
    index_exists = frappe.db.sql("""
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema=DATABASE()
          AND table_name='tabStock Entry'
          AND index_name=%s
          AND non_unique=0
    """, (INDEX_NAME,))[0][0] or 0
    if not index_exists:
        frappe.db.sql(f"""
            CREATE UNIQUE INDEX `{INDEX_NAME}`
            ON `tabStock Entry` (`idpedido_ongsys`)
        """)

    custom_field = frappe.db.get_value(
        "Custom Field",
        {"dt": "Stock Entry", "fieldname": "idpedido_ongsys"},
        "name",
    )
    if custom_field:
        frappe.db.set_value(
            "Custom Field",
            custom_field,
            {"fieldtype": "Data", "unique": 1, "read_only": 1, "no_copy": 1},
            update_modified=False,
        )
    frappe.clear_cache(doctype="Stock Entry")
