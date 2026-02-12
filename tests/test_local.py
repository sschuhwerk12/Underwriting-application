import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from underwriting_model import run_model
from generate_report import generate_summary


ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "examples" / "sample_assumptions.json"


class LocalWorkflowTests(unittest.TestCase):
    def test_run_model_basic_outputs(self):
        assumptions = json.loads(SAMPLE.read_text())
        result = run_model(assumptions)

        self.assertEqual(len(result["monthly"]), assumptions["holdMonths"])
        self.assertEqual(len(result["annual"]), assumptions["holdMonths"] // 12)
        self.assertGreater(result["metrics"]["terminal_value"], 0)
        self.assertGreater(result["metrics"]["unlevered_irr"], -1)
        self.assertLess(result["metrics"]["unlevered_irr"], 1)

    def test_report_generation_sections(self):
        assumptions = json.loads(SAMPLE.read_text())
        text = generate_summary(assumptions)

        self.assertIn("# Institutional Underwriting Memo", text)
        self.assertIn("## 5) Debt & Refinance", text)
        self.assertIn("SOFR", text)

    def test_cli_model_generates_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "model_output.json"
            proc = subprocess.run(
                [sys.executable, "underwriting_model.py", "--input", str(SAMPLE), "--output", str(output)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            payload = json.loads(output.read_text())
            self.assertIn("metrics", payload)
            self.assertIn("monthly", payload)


if __name__ == "__main__":
    unittest.main()
