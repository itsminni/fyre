package minni.fyre.discover.presentation

import minni.fyre.discover.data.DiscoveryRepository
import minni.fyre.discover.model.DiscoveryProfile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class DiscoveryFeedState(
    val profiles: List<DiscoveryProfile> = emptyList(),
    val initialLoading: Boolean = true,
    val nextCursor: String? = null,
    val error: String? = null
)

internal class DiscoveryFeed(private val repository: DiscoveryRepository) {
    private val _state = MutableStateFlow(DiscoveryFeedState())
    val state = _state.asStateFlow()
    private val mutex = Mutex()
    private val visited = mutableSetOf<String>()

    suspend fun refresh() = load(append = false)
    suspend fun loadMore() = load(append = true)

    private suspend fun load(append: Boolean) = mutex.withLock {
        val cursor = if (append) _state.value.nextCursor ?: return@withLock else null
        if (append && cursor in visited) {
            _state.value = _state.value.copy(nextCursor = null)
            return@withLock
        }
        try {
            repository.loadPage(cursor).fold(onSuccess = { page ->
                if (!append) visited.clear() else visited.add(cursor!!)
                _state.value = DiscoveryFeedState(
                    profiles = (if (append) _state.value.profiles + page.profiles else page.profiles).distinctBy { it.id },
                    initialLoading = false,
                    nextCursor = page.nextCursor?.takeIf { it !in visited }
                )
            }, onFailure = { error ->
                if (error is CancellationException) throw error
                _state.value = _state.value.copy(initialLoading = false, error = "Impossibile aggiornare i profili. Tocca per riprovare.")
            })
        } catch (cancelled: CancellationException) { throw cancelled }
    }
}
