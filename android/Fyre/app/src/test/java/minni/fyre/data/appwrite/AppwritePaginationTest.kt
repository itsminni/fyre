package minni.fyre.data.appwrite

import com.google.gson.JsonObject
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppwritePaginationTest {
    @Test
    fun `collects every page using the last row cursor`() = runTest {
        val requests = mutableListOf<Triple<Int, String?, Int>>()
        val rows = collectAppwriteRows { pageSize, cursorAfter, offset ->
            requests += Triple(pageSize, cursorAfter, offset)
            if (cursorAfter == null) {
                AppwriteRowsPage(rows = makeRows(1..100, includeIds = true), total = 125)
            } else {
                AppwriteRowsPage(rows = makeRows(101..125, includeIds = true), total = 125)
            }
        }

        assertEquals(125, rows.size)
        assertEquals(2, requests.size)
        assertEquals(100, requests[0].first)
        assertEquals("row-100", requests[1].second)
        assertEquals(0, requests[1].third)
    }

    @Test
    fun `falls back to offset when rows have no cursor`() = runTest {
        val requests = mutableListOf<Triple<Int, String?, Int>>()
        val rows = collectAppwriteRows { pageSize, cursorAfter, offset ->
            requests += Triple(pageSize, cursorAfter, offset)
            if (offset == 0) {
                AppwriteRowsPage(rows = makeRows(1..100, includeIds = false), total = 102)
            } else {
                AppwriteRowsPage(rows = makeRows(101..102, includeIds = false), total = 102)
            }
        }

        assertEquals(102, rows.size)
        assertEquals(2, requests.size)
        assertNull(requests[1].second)
        assertEquals(100, requests[1].third)
    }

    @Test
    fun `honours an explicit maximum row count`() = runTest {
        val requests = mutableListOf<Triple<Int, String?, Int>>()
        val rows = collectAppwriteRows(maximumRows = 1) { pageSize, cursorAfter, offset ->
            requests += Triple(pageSize, cursorAfter, offset)
            AppwriteRowsPage(rows = makeRows(1..1, includeIds = true), total = 20)
        }

        assertEquals(1, rows.size)
        assertEquals(listOf(Triple(1, null, 0)), requests)
    }

    private fun makeRows(range: IntRange, includeIds: Boolean): List<JsonObject> {
        return range.map { index ->
            JsonObject().apply {
                if (includeIds) addProperty("\$id", "row-$index")
                addProperty("value", index)
            }
        }
    }
}
