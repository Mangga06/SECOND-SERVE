# Review dataset

Corrections live in the database with original values, updated values, reviewer, reason and timestamp. The Super Admin **Model & dataset** tab exports this data as JSON from `/api/admin/corrections`.

Masks are polygon arrays in normalized 0–1 coordinates on 512×512 plate images. Initial and remaining polygons are separate. Authenticated image URLs remain associated with each analysis. Exports do not make images public.

Synthetic seed records are labeled `demo=true`. Their assigned food names and impact factors are illustrative. They are unsuitable as real-world accuracy evidence or as a substitute for a labeled validation dataset.
