# Factorial Implementation

This document demonstrates a literate programming approach to implementing a factorial function.

## Function Definition

```{python #factorial-function}
def factorial(n: int) -> int:
    """Calculate the factorial of a number."""
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    return <<base-case>> if n <= 1 else <<recursive-case>>
```

## Base Case

```{python #base-case}
1
```

## Recursive Case

```{python #recursive-case}
n * factorial(n - 1)
```

## Complete Implementation

```{python #complete-implementation}
<<factorial-function>>

# Test the function
print(factorial(5))  # Should print 120
```
