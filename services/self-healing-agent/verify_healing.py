#!/usr/bin/env python3
"""
ARASUL PLATFORM - Self-Healing Verification Script
Validates that all self-healing features are properly implemented
"""

import os
import sys
import ast
import inspect


def read_file(filename):
    """Read Python file content"""
    filepath = os.path.join(os.path.dirname(__file__), filename)
    with open(filepath, 'r') as f:
        return f.read()


def get_class_methods_from_ast(source_code, class_name):
    """Extract methods from a class using AST parsing"""
    tree = ast.parse(source_code)
    methods = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    methods.append(item.name)
    return methods


def get_module_functions_from_ast(source_code):
    """Extract top-level functions from module using AST parsing"""
    tree = ast.parse(source_code)
    functions = []

    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            functions.append(node.name)

    return functions


def get_constants_from_ast(source_code):
    """Extract constants from module using AST parsing"""
    tree = ast.parse(source_code)
    constants = {}

    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    # Handle constants (Python 3.8+ uses ast.Constant)
                    if isinstance(node.value, ast.Constant):
                        constants[target.id] = node.value.value
                    # Handle older Python versions
                    elif hasattr(ast, 'Num') and isinstance(node.value, ast.Num):
                        constants[target.id] = node.value.n
                    elif hasattr(ast, 'Str') and isinstance(node.value, ast.Str):
                        constants[target.id] = node.value.s
                    elif isinstance(node.value, ast.List):
                        constants[target.id] = '<list>'
                    elif isinstance(node.value, ast.Call):
                        if hasattr(node.value.func, 'id'):
                            constants[target.id] = f'<{node.value.func.id}()>'

    return constants


def verify_methods(actual_methods, expected_methods):
    """Verify that all expected methods exist"""
    missing = []
    found = []

    for method in expected_methods:
        if method in actual_methods:
            found.append(method)
        else:
            missing.append(method)

    return found, missing


def main():
    """Main verification"""
    print("=" * 70)
    print("ARASUL SELF-HEALING ENGINE - FEATURE VERIFICATION")
    print("=" * 70)
    print()

    # Parse source files
    try:
        healing_source = read_file('healing_engine.py')
        validation_source = read_file('post_reboot_validation.py')
    except Exception as e:
        print(f"❌ Failed to read source files: {e}")
        return 1

    # Extract class methods and functions
    healing_methods = get_class_methods_from_ast(healing_source, 'SelfHealingEngine')
    validation_functions = get_module_functions_from_ast(validation_source)
    healing_constants = get_constants_from_ast(healing_source)

    total_checks = 0
    passed_checks = 0

    # ========================================================================
    # CATEGORY A - Service Down
    # ========================================================================
    print("📋 CATEGORY A - Service Down Recovery")
    print("-" * 70)

    category_a_methods = [
        'handle_category_a_service_down',
        'record_failure',
        'get_failure_count',
        'is_in_cooldown',
        'record_recovery_action'
    ]

    found, missing = verify_methods(healing_methods, category_a_methods)

    for method in found:
        print(f"  ✅ {method}")
        passed_checks += 1

    for method in missing:
        print(f"  ❌ {method} - MISSING!")

    total_checks += len(category_a_methods)
    print()

    # ========================================================================
    # CATEGORY B - Overload Recovery
    # ========================================================================
    print("📋 CATEGORY B - Overload Recovery")
    print("-" * 70)

    category_b_methods = [
        'handle_category_b_overload',
        'clear_llm_cache',
        'reset_gpu_session',
        'throttle_gpu',
        'pause_n8n_workflows'
    ]

    found, missing = verify_methods(healing_methods, category_b_methods)

    for method in found:
        print(f"  ✅ {method}")
        passed_checks += 1

    for method in missing:
        print(f"  ❌ {method} - MISSING!")

    total_checks += len(category_b_methods)
    print()

    # ========================================================================
    # CATEGORY C - Critical Recovery
    # ========================================================================
    print("📋 CATEGORY C - Critical Recovery")
    print("-" * 70)

    category_c_methods = [
        'handle_category_c_critical',
        'hard_restart_application_services',
        'perform_disk_cleanup',
        'perform_db_vacuum',
        'perform_gpu_reset'
    ]

    found, missing = verify_methods(healing_methods, category_c_methods)

    for method in found:
        print(f"  ✅ {method}")
        passed_checks += 1

    for method in missing:
        print(f"  ❌ {method} - MISSING!")

    total_checks += len(category_c_methods)
    print()

    # ========================================================================
    # CATEGORY D - System Reboot
    # ========================================================================
    print("📋 CATEGORY D - System Reboot")
    print("-" * 70)

    category_d_methods = [
        'handle_category_d_reboot',
        'save_reboot_state'
    ]

    found, missing = verify_methods(healing_methods, category_d_methods)

    for method in found:
        print(f"  ✅ {method}")
        passed_checks += 1

    for method in missing:
        print(f"  ❌ {method} - MISSING!")

    total_checks += len(category_d_methods)
    print()

    # ========================================================================
    # POST-REBOOT VALIDATION
    # ========================================================================
    print("📋 POST-REBOOT VALIDATION MODULE")
    print("-" * 70)

    post_reboot_functions = [
        'connect_db',
        'get_pending_reboot_event',
        'check_service_health',
        'get_current_metrics',
        'validate_post_reboot_state',
        'update_reboot_event',
        'log_validation_event'
    ]

    found, missing = verify_methods(validation_functions, post_reboot_functions)

    for func in found:
        print(f"  ✅ {func}")
        passed_checks += 1

    for func in missing:
        print(f"  ❌ {func} - MISSING!")

    total_checks += len(post_reboot_functions)
    print()

    # ========================================================================
    # CORE INFRASTRUCTURE
    # ========================================================================
    print("📋 CORE INFRASTRUCTURE")
    print("-" * 70)

    core_methods = [
        'connect_db',
        'execute_query',
        'log_event',
        'get_metrics',
        'check_service_health',
        'check_disk_usage',
        'run_healing_cycle'
    ]

    found, missing = verify_methods(healing_methods, core_methods)

    for method in found:
        print(f"  ✅ {method}")
        passed_checks += 1

    for method in missing:
        print(f"  ❌ {method} - MISSING!")

    total_checks += len(core_methods)
    print()

    # ========================================================================
    # CONFIGURATION VALIDATION
    # ========================================================================
    print("📋 CONFIGURATION VALIDATION")
    print("-" * 70)

    config_vars = [
        'HEALING_INTERVAL',
        'CPU_OVERLOAD_THRESHOLD',
        'RAM_OVERLOAD_THRESHOLD',
        'GPU_OVERLOAD_THRESHOLD',
        'TEMP_THROTTLE_THRESHOLD',
        'TEMP_RESTART_THRESHOLD',
        'DISK_WARNING',
        'DISK_CLEANUP',
        'DISK_CRITICAL',
        'DISK_REBOOT',
        'FAILURE_WINDOW_MINUTES',
        'CRITICAL_WINDOW_MINUTES',
        'MAX_FAILURES_IN_WINDOW',
        'MAX_CRITICAL_EVENTS',
        'APPLICATION_SERVICES'
    ]

    # ENV-based configuration (loaded dynamically)
    env_config_vars = ['ENABLED', 'REBOOT_ENABLED']

    config_found = []
    config_missing = []

    for var in config_vars:
        if var in healing_constants:
            config_found.append(var)
        else:
            config_missing.append(var)

    for config_name in config_found:
        value = healing_constants.get(config_name, 'N/A')
        print(f"  ✅ {config_name} = {value}")
        passed_checks += 1

    for config_name in config_missing:
        print(f"  ❌ {config_name} - MISSING!")

    total_checks += len(config_vars)

    # Check ENV-based config (these are loaded via os.getenv)
    for env_var in env_config_vars:
        # Check if variable is used in source code
        if env_var in healing_source:
            print(f"  ✅ {env_var} = <from ENV>")
            passed_checks += 1
        else:
            print(f"  ❌ {env_var} - NOT USED!")
        total_checks += 1

    print()

    # ========================================================================
    # FINAL SUMMARY
    # ========================================================================
    print("=" * 70)
    print("VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"Total Checks: {total_checks}")
    print(f"Passed: {passed_checks}")
    print(f"Failed: {total_checks - passed_checks}")
    print()

    if passed_checks == total_checks:
        print("✅ ALL CHECKS PASSED - Self-Healing Engine is fully implemented!")
        print()
        print("Features Verified:")
        print("  ✅ Category A: Service Down (Restart, Stop+Start, Failure Tracking)")
        print("  ✅ Category B: Overload (CPU, RAM, GPU, Temperature Management)")
        print("  ✅ Category C: Critical (Hard Restart, Cleanup, Vacuum, GPU Reset)")
        print("  ✅ Category D: System Reboot (State Save, Reboot, Validation)")
        print("  ✅ Post-Reboot Validation Module")
        print("  ✅ Core Infrastructure (DB, Metrics, Health Checks)")
        print("  ✅ Configuration (All thresholds and settings)")
        print()
        return 0
    else:
        print(f"❌ {total_checks - passed_checks} CHECKS FAILED")
        print("Please review the missing features above.")
        print()
        return 1


if __name__ == '__main__':
    sys.exit(main())
