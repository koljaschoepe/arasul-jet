"""
Zahlen in den Meldungen der Selbstheilung (J35, 26.09.2026).

`description` und `action_taken` stehen in der Oberfläche unter „Selbstheilung"
vor einem Administrator, also deutsch und mit deutschen Zahlen: „87,5 °C",
„1.234.567". Die Sätze selbst stehen an ihrer Stelle im Code; hier liegt nur,
was mehrere davon brauchen.
"""


def komma(wert: float, stellen: int = 1) -> str:
    """Eine Dezimalzahl mit Komma: 87.46 -> '87,5'."""
    return f'{wert:.{stellen}f}'.replace('.', ',')


def tausender(wert: int) -> str:
    """Eine große ganze Zahl mit Punkten: 1234567 -> '1.234.567'."""
    return f'{wert:,}'.replace(',', '.')
