package com.rtc.worddictation;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import java.util.concurrent.*;
import org.robolectric.Robolectric;
import org.robolectric.Shadows;
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
    public static class FakeRemoteService extends AiConnectionService {
        final CountDownLatch ack = new CountDownLatch(1);
        JSONObject firstResponse;
        int posts;
        boolean delivered;
        @Override protected String request(String base, String secret, String path, JSONObject body) throws Exception {
            if (path.equals("/device/result")) {
                posts++;
                if (posts == 1) { firstResponse = new JSONObject(body.toString()); throw new java.io.IOException("Temporary outage"); }
                assertEquals(firstResponse.toString(), body.toString()); ack.countDown(); return "{}";
            }
            if (!delivered) { delivered = true; return "[{\"id\":\"service-one\",\"name\":\"import_wordbook\",\"arguments\":{\"name\":\"后台\",\"text\":\"bank,银行\"}}]"; }
            return "[]";
        }
    }
    @Test public void serviceExecutesAndRetriesResultsWithoutPageThenStopsOnTaskRemoval() throws Exception {
        AiConnectionService.observer = null;
        FakeRemoteService service = Robolectric.buildService(FakeRemoteService.class).create().get();
        try {
            Intent intent = new Intent().putExtra("owner", "test").putExtra("url", "https://example.invalid").putExtra("token", "test-secret");
            service.onStartCommand(intent, 0, 1);
            assertTrue("background response not returned", service.ack.await(10, TimeUnit.SECONDS));
            assertEquals(2, service.posts);
            assertTrue(service.firstResponse.has("result"));
            assertEquals(1, AiWordStore.load(context, null).getJSONArray("books").length());
            assertFalse(Shadows.shadowOf(service).isStoppedBySelf());
            service.onTaskRemoved(new Intent());
            assertTrue(Shadows.shadowOf(service).isStoppedBySelf());
        } finally { service.onDestroy(); }
    }


    @Test public void attachmentsUploadReadReplayAndScope() throws Exception {
        String id="att_native123456",bookId="attachbook",wordId="attachword";
        AiWordStore.load(context,new JSONObject().put("books",new JSONArray().put(new JSONObject().put("id",bookId).put("name","附件词库").put("pageSize",50).put("whitelist",new JSONObject()).put("words",new JSONArray().put(new JSONObject().put("id",wordId).put("front","问题").put("back","答案"))))).put("receipts",new JSONObject()).toString());
        JSONObject args=new JSONObject().put("book_id",bookId).put("word_id",wordId).put("attachment_id",id).put("name","a.wav").put("mime","audio/wav").put("size",3).put("side","back").put("offset",0).put("data_base64","YWJj").put("final",true);
        JSONObject request=new JSONObject().put("id","upload-first").put("name","upload_attachment").put("arguments",args);
        JSONObject first=AiWordStore.execute(context,request);assertTrue(first.getBoolean("changed"));assertTrue(first.getJSONObject("response").getJSONObject("result").getBoolean("saved"));
        JSONObject replay=AiWordStore.execute(context,request);assertFalse(replay.getBoolean("changed"));assertEquals(1,AiWordStore.load(context,null).getJSONArray("books").getJSONObject(0).getJSONArray("words").getJSONObject(0).getJSONArray("attachments").length());
        JSONObject readArgs=new JSONObject().put("book_id",bookId).put("word_id",wordId).put("attachment_id",id).put("mode","bytes").put("limit",2);
        JSONObject read=AiWordStore.execute(context,new JSONObject().put("id","read").put("name","get_attachment").put("arguments",readArgs));assertEquals("YWI=",read.getJSONObject("response").getJSONObject("result").getString("data"));assertEquals(2,read.getJSONObject("response").getJSONObject("result").getInt("next_offset"));
        readArgs.put("book_id","other");assertTrue(AiWordStore.execute(context,new JSONObject().put("name","get_attachment").put("arguments",readArgs)).getJSONObject("response").has("error"));
        args.put("data_base64","ZGVm");assertTrue(AiWordStore.execute(context,request).getJSONObject("response").has("error"));
    }
}
