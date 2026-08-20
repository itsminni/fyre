package minni.fyre

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import minni.fyre.data.appwrite.PersistentCookieJar
import okhttp3.OkHttpClient

class FyreApplication : Application(), ImageLoaderFactory {
    override fun newImageLoader(): ImageLoader {
        val authenticatedClient = OkHttpClient.Builder()
            .cookieJar(PersistentCookieJar(applicationContext))
            .build()

        return ImageLoader.Builder(applicationContext)
            .okHttpClient(authenticatedClient)
            .build()
    }
}
