"""
Shared test configuration for glycan-mass-spec-annotator test suite.
"""
import os

# Set a test audit key before any module imports that use AuditLogger
os.environ.setdefault("AUDIT_SECRET_KEY", "test-audit-key-for-unit-tests-only-do-not-use-in-production")
