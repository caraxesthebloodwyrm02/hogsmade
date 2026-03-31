"""
Source code for the python-basics module.

This file contains the functions being tested.
In a larger project, this would be a proper Python package.
"""


def add(a: int, b: int) -> int:
    """
    Add two integers and return the sum.

    Args:
        a: First integer to add
        b: Second integer to add

    Returns:
        The sum of a and b

    Examples:
        The function can be called with positional or keyword arguments:
        >>> add(2, 3)
        5
        >>> add(-1, 1)
        0
    """
    return a + b


def subtract(a: int, b: int) -> int:
    """
    Subtract b from a and return the result.

    Args:
        a: The number to subtract from
        b: The number to subtract

    Returns:
        The result of a - b
    """
    return a - b
