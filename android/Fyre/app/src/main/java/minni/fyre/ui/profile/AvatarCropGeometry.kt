package minni.fyre.ui.profile

internal data class AvatarCropWindow(val left: Int, val top: Int, val size: Int)

internal fun avatarCropWindow(width: Int, height: Int, zoom: Float, horizontal: Float, vertical: Float): AvatarCropWindow {
    require(width > 0 && height > 0)
    val size = (minOf(width, height) / zoom.coerceIn(1f, 4f)).toInt().coerceAtLeast(1)
    return AvatarCropWindow(
        ((width - size) * (horizontal.coerceIn(-1f, 1f) + 1f) / 2f).toInt().coerceIn(0, width - size),
        ((height - size) * (vertical.coerceIn(-1f, 1f) + 1f) / 2f).toInt().coerceIn(0, height - size),
        size
    )
}
