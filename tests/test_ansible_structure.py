import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANSIBLE = ROOT / "ansible"


class AnsibleStructureTests(unittest.TestCase):
    def test_required_playbooks_exist(self):
        for name in ("audit", "backup", "deploy", "validate", "rollback", "restore_database"):
            self.assertTrue((ANSIBLE / "playbooks" / f"{name}.yml").is_file(), name)

    def test_inventory_does_not_contain_credentials(self):
        inventory = (ANSIBLE / "inventories/production/hosts.yml").read_text()
        lowered = inventory.lower()
        for forbidden in ("password", "private_key", "ongsys", "token", "secret"):
            self.assertNotIn(forbidden, lowered)

    def test_database_restore_is_safely_blocked(self):
        restore = (ANSIBLE / "playbooks/restore_database.yml").read_text()
        self.assertIn("RESTAURAR-BANCO", restore)
        self.assertIn("ansible.builtin.fail", restore)

    def test_deploy_requires_exact_revision_and_backup(self):
        deploy = (ANSIBLE / "playbooks/deploy.yml").read_text()
        self.assertIn("^[0-9a-f]{40}$", deploy)
        self.assertLess(deploy.index("name: backup"), deploy.index("name: deploy"))

    def test_mutating_playbooks_share_an_exclusive_lock(self):
        for name in ("backup", "deploy", "rollback"):
            playbook = (ANSIBLE / "playbooks" / f"{name}.yml").read_text()
            self.assertIn("cdc_deploy_lock", playbook, name)
            self.assertIn("argv: [mkdir", playbook, name)
            self.assertIn("state: absent", playbook, name)
            self.assertIn("always:", playbook, name)


if __name__ == "__main__":
    unittest.main()
