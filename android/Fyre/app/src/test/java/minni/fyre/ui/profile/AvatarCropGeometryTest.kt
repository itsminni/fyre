package minni.fyre.ui.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AvatarCropGeometryTest {
    @Test fun `portrait and landscape crops remain square and within the image`() {
        for ((width, height) in listOf(300 to 1200, 1200 to 300, 1 to 1)) {
            for (zoom in listOf(-1f, 1f, 2f, 100f)) for (offset in listOf(-5f, 0f, 5f)) {
                val crop = avatarCropWindow(width, height, zoom, offset, -offset)
                assertTrue(crop.left >= 0 && crop.top >= 0 && crop.size > 0)
                assertTrue(crop.left + crop.size <= width && crop.top + crop.size <= height)
            }
        }
        assertEquals(AvatarCropWindow(450, 0, 300), avatarCropWindow(1200, 300, 1f, 0f, 0f))
    }
}
