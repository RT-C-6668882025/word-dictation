package com.rtc.worddictation;

import static org.junit.Assert.*;
import android.content.Context;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class AiWordStoreTest {
    private Context context;
    @Before public void setup() { context = RuntimeEnvironment.getApplication(); context.getSharedPreferences("CapacitorStorage", 0).edit().clear().commit(); }
    private JSONObject importRequest() throws Exception { return new JSONObject().put("id", "persistent-one").put("name", "import_wordbook").put("arguments", new JSONObject().put("name", "测试").put("text", "bank,银行\nmoney,钱")); }
    @Test public void commandWorksWithoutActivityAndReceiptSurvivesReload() throws Exception {
        assertNull(AiConnectionService.observer);
        AiWordStore.load(context, "{\"books\":[],\"receipts\":{}}");
        JSONObject first = AiWordStore.execute(context, importRequest());
        assertTrue(first.getBoolean("changed"));
        JSONObject loaded = AiWordStore.load(context, "{\"books\":[]}");
        assertEquals(1, loaded.getJSONArray("books").length());
        assertTrue(loaded.getJSONObject("receipts").has("persistent-one"));
        JSONObject second = AiWordStore.execute(context, importRequest());
        assertFalse(second.getBoolean("changed"));
        assertEquals(first.getJSONObject("response").toString(), second.getJSONObject("response").toString());
        assertEquals(1, AiWordStore.load(context, null).getJSONArray("books").length());
    }
    @Test public void stalePageCannotOverwriteBackgroundMutation() throws Exception {
        JSONObject page = AiWordStore.load(context, "{\"books\":[],\"receipts\":{}}");
        AiWordStore.execute(context, importRequest());
        try { AiWordStore.saveBooks(context, page.optLong("revision"), new JSONArray()); fail("stale save accepted"); }
        catch (java.io.IOException expected) { }
        assertEquals(1, AiWordStore.load(context, null).getJSONArray("books").length());
        JSONObject fresh = AiWordStore.load(context, null);
        JSONObject saved = AiWordStore.saveBooks(context, fresh.optLong("revision"), new JSONArray());
        assertEquals(0, saved.getJSONArray("books").length());
        // Deleting a book must not delete its receipt and recreate it on redelivery.
        AiWordStore.execute(context, importRequest());
        assertEquals(0, AiWordStore.load(context, null).getJSONArray("books").length());
    }
}
