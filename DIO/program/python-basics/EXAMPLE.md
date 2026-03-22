# ** example use case scenarios **

// Tone: simple and direct

## Use Case 1: Basic Calculator
```python
# Simple addition for everyday math
total = add(15, 25)  # Calculate total cost
print(f"Total: ${total}")  # Output: Total: $40
```

## Use Case 2: Score Tracking
```python
# Game or test score accumulation
current_score = 85
bonus_points = 10
final_score = add(current_score, bonus_points)
print(f"Final score: {final_score}")  # Output: Final score: 95
```

## Use Case 3: Inventory Management
```python
# Adding items to existing inventory
existing_stock = 120
new_shipment = 45
total_inventory = add(existing_stock, new_shipment)
print(f"Total inventory: {total_inventory} units")  # Output: Total inventory: 165 units
```

## Use Case 4: Time Calculation
```python
# Adding hours or minutes
hours_worked = 8
overtime_hours = 2
total_hours = add(hours_worked, overtime_hours)
print(f"Total hours: {total_hours}")  # Output: Total hours: 10
```

## Use Case 5: Coordinate System
```python
# 2D coordinate addition (x, y positions)
x_pos = 100
y_pos = 50
# You could extend this to work with tuples or objects
new_x = add(x_pos, 25)  # Move right 25 pixels
new_y = add(y_pos, 10)  # Move down 10 pixels
print(f"New position: ({new_x}, {new_y})")  # Output: New position: (125, 60)
```

## Adaptation Examples

### Extending for subtraction:
```python
def subtract(a: int, b: int) -> int:
    return a - b
```

### Extending for floating point:
```python
def add_float(a: float, b: float) -> float:
    return a + b
```

### Extending for lists:
```python
def add_lists(list1: list, list2: list) -> list:
    return list1 + list2
```

### Extending with error handling:
```python
def add_safe(a: int, b: int) -> int:
    try:
        return a + b
    except TypeError:
        print("Both arguments must be numbers")
        return 0
```
