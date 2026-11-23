An inline message with an icon, a short title and a sentence of detail.

Provide `tone` (`info`, `success`, `warning`, `danger`), `title`, and `children`.

- Every tone has its own icon and a title, so status never depends on colour.
- Say what is uncertain and why, and be comfortable with the gap: "There's a gap in the mapped river network."
- `danger` uses `role=alert`. Other tones use `role=status`.
