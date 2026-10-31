package minni.fyre.data.appwrite

import com.google.gson.JsonParser
import java.io.File
import minni.fyre.messages.data.messageOperationRowId
import org.junit.Assert.assertEquals
import org.junit.Test

class MessageIdentityContractTest {
    @Test fun `Android agrees with shared server and iOS message identities`() {
        val fixture = File("../../../shared/contracts/fixtures/message-identity.json")
        JsonParser.parseString(fixture.readText()).asJsonArray.forEach { raw ->
            val row = raw.asJsonObject
            assertEquals(row["messageId"].asString, messageOperationRowId(
                row["userId"].asString, row["threadId"].asString, row["operationId"].asString))
        }
    }
}
