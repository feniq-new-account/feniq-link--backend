/// Where a rep-side screen's data is: not asked for yet, on its way, here, or
/// failed (the error code/message sit next to it in the state).
enum RepLoadStatus { initial, loading, loaded, error }
