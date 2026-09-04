"""
Automated Pytest Test Suite for Glycan Mass Spec Annotator.
Domain: AI Drug Discovery, Structural Biology & Wet-Lab Robotics
Standard: wwPDB / IUPAC / OpenSMILES / ISAC Standards
"""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from agents.base import PHIGuard, AuditLogger, SecurityException
from agents.models import SystemTaskPayload, UrgencyLevel, SystemIntegrityStatus
from agents.workers import InvariantQCWorker, SafetyEscalationWorker, ProtocolConformanceWorker
from agents.supervisor import SystemSupervisor
from cli import main


def test_phi_guard_enforcement():
    with pytest.raises(SecurityException):
        PHIGuard.assert_no_phi("Patient MRN-994827 blood culture positive for Staphylococcus")

    # Clean text passes
    PHIGuard.assert_no_phi("Analytical assay specimen KEY-001 optimal")


def test_specialized_workers():
    # Worker 1: QC Invariant
    p1 = SystemTaskPayload(task_id="T1", target_identifier="KEY-01", primary_metric=35.0)
    alerts1 = InvariantQCWorker.evaluate(p1)
    assert len(alerts1) == 1
    assert alerts1[0].urgency == UrgencyLevel.ELEVATED

    # Worker 2: Safety
    p2 = SystemTaskPayload(task_id="T2", target_identifier="KEY-02", primary_metric=10.0, is_critical_flag=True)
    alerts2 = SafetyEscalationWorker.evaluate(p2)
    assert len(alerts2) == 1
    assert alerts2[0].urgency == UrgencyLevel.CRITICAL_STAT

    # Worker 3: Protocol Conformance
    p3 = SystemTaskPayload(task_id="T3", target_identifier="KEY-03", primary_metric=10.0, status_descriptor="DISCORDANT_ANOMALY")
    alerts3 = ProtocolConformanceWorker.evaluate(p3)
    assert len(alerts3) == 1


def test_supervisor_consensus_and_audit():
    supervisor = SystemSupervisor(model_provider="mock")
    payload = SystemTaskPayload(
        task_id="TASK-PROD-01",
        target_identifier="KEY-PROD-01",
        primary_metric=12.0,
        secondary_metric=4.0,
        status_descriptor="NOMINAL"
    )
    dossier = supervisor.process_task(payload)
    assert dossier.overall_urgency == UrgencyLevel.ROUTINE
    assert dossier.integrity_status == SystemIntegrityStatus.VALIDATED
    assert dossier.audit_hash != ""

    # Verify cryptographic audit trail
    assert AuditLogger.verify_integrity() is True

    # CLI tests
    assert main(["audit", "--task-id", "CLI-TEST-01"]) == 0
    assert main(["chat", "Explain", "specifications"]) == 0
    assert main(["verify-audit"]) == 0


def test_input_validation_rejects_nan():
    """Test that NaN metric values are rejected."""
    import math
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        SystemTaskPayload(task_id="T1", target_identifier="KEY-01", primary_metric=float("nan"))


def test_input_validation_rejects_infinity():
    """Test that infinity metric values are rejected."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        SystemTaskPayload(task_id="T1", target_identifier="KEY-01", primary_metric=float("inf"))


def test_input_validation_rejects_empty_identifiers():
    """Test that empty identifier fields are rejected."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        SystemTaskPayload(task_id="", target_identifier="KEY-01", primary_metric=10.0)
    with pytest.raises(ValidationError):
        SystemTaskPayload(task_id="T1", target_identifier="   ", primary_metric=10.0)


def test_batch_file_not_found():
    """Test that batch command handles missing file gracefully."""
    result = main(["batch", "-i", "nonexistent_file_xyz.csv"])
    assert result == 1


def test_audit_key_required_when_env_not_set():
    """Test that AuditTrail requires AUDIT_SECRET_KEY when not provided."""
    from agents.base import AuditTrail
    original = os.environ.pop("AUDIT_SECRET_KEY", None)
    try:
        AuditLogger.reset()
        with pytest.raises(SecurityException):
            AuditTrail()
    finally:
        if original:
            os.environ["AUDIT_SECRET_KEY"] = original
        AuditLogger.reset()
