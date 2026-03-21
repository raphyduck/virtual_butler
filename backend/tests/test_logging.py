import logging


def test_noisy_third_party_loggers_are_quieted() -> None:
    assert logging.getLogger("sqlalchemy.engine").level == logging.WARNING
    assert logging.getLogger("sqlalchemy.pool").level == logging.WARNING
