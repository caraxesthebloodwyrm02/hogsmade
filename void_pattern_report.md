# Void Pattern Bug Detection Report

Total files analyzed: 16
Total functions analyzed: 425
Total critical issues: 0
Total warnings: 23

## Critical Issues (Require Immediate Attention)

## Warnings

- **src/vection/demo.py:438** `main`: 'except Exception:' at line 438 without re-raise may hide bugs
- **src/vection/core/context_membrane.py:250** `evaluate_retention`: 'except Exception:' at line 250 without re-raise may hide bugs
- **src/vection/core/stream_context.py:700** `_emit`: 'except Exception:' at line 700 without re-raise may hide bugs
- **src/vection/core/engine.py:300** `_extract_event_data`: 'except Exception:' at line 300 without re-raise may hide bugs
- **src/vection/core/emergence_layer.py:196** `observe`: 'except Exception:' at line 196 without re-raise may hide bugs
- **src/vection/security/manager.py:338** `check_request`: 'except Exception:' at line 338 without re-raise may hide bugs
- **src/vection/security/manager.py:706** `_notify_callbacks`: 'except Exception:' at line 706 without re-raise may hide bugs
- **src/vection/security/rate_limiter.py:690** `_log_rate_limit_event`: 'except Exception:' at line 690 without re-raise may hide bugs
- **src/vection/security/events.py:524** `emit`: 'except Exception:' at line 524 without re-raise may hide bugs
- **src/vection/security/input_validator.py:844** `_log_validation_failure`: 'except Exception:' at line 844 without re-raise may hide bugs
- **src/vection/security/audit_logger.py:435** `log_event`: 'except Exception:' at line 435 without re-raise may hide bugs
- **src/vection/security/anomaly_detector.py:1021** `_create_alert`: 'except Exception:' at line 1021 without re-raise may hide bugs
- **src/vection/security/anomaly_detector.py:1048** `_log_alert`: 'except Exception:' at line 1048 without re-raise may hide bugs
- **src/vection/security/session_isolator.py:834** `_log_access_check`: 'except Exception:' at line 834 without re-raise may hide bugs
- **src/vection/security/session_isolator.py:852** `_log_violation`: 'except Exception:' at line 852 without re-raise may hide bugs
- **src/vection/security/session_isolator.py:876** `_log_grant_created`: 'except Exception:' at line 876 without re-raise may hide bugs
- **src/vection/security/verify_audit_trail.py:44** `load_audit_events`: 'except Exception:' at line 44 without re-raise may hide bugs
- **src/vection/workers/clusterer.py:389** `_processing_loop`: 'except Exception:' at line 389 without re-raise may hide bugs
- **src/vection/workers/clusterer.py:497** `_emit_clusters`: 'except Exception:' at line 497 without re-raise may hide bugs
- **src/vection/workers/correlator.py:311** `_processing_loop`: 'except Exception:' at line 311 without re-raise may hide bugs
- **src/vection/workers/correlator.py:407** `_promote_candidates`: 'except Exception:' at line 407 without re-raise may hide bugs
- **src/vection/workers/projector.py:425** `_processing_loop`: 'except Exception:' at line 425 without re-raise may hide bugs
- **src/vection/workers/projector.py:675** `_store_projection`: 'except Exception:' at line 675 without re-raise may hide bugs