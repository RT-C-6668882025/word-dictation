package com.rtc.worddictation;

import android.content.Context;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Private binary files, separate from wordbook Preferences. No public URLs. */
public final class AttachmentStore {
    private static File file(Context c,String id,String suffix) throws IOException {
        if(id==null||!id.matches("att_[a-zA-Z0-9_-]{8,80}"))throw new IOException("无效附件 ID");
        File dir=new File(c.getFilesDir(),"card-attachments");if(!dir.exists()&&!dir.mkdirs())throw new IOException("附件目录创建失败");return new File(dir,id+suffix);
    }
    public static synchronized JSONObject write(Context c,JSONObject a) throws Exception {
        String id=a.getString("id"),mime=a.getString("mime");long offset=a.getLong("offset"),size=a.getLong("size");
        if(!(a.get("offset") instanceof Number)||a.getDouble("offset")!=offset||!(a.get("size") instanceof Number)||a.getDouble("size")!=size)throw new IOException("附件大小和偏移需为整数");
        if(offset<0||size<1||size>50L*1024*1024||!mime.matches("image/(jpeg|png|webp|gif)|audio/(mpeg|mp4|wav|ogg|flac|webm)|application/pdf"))throw new IOException("附件大小或格式无效");
        byte[] bytes=Base64.decode(a.getString("data"),Base64.NO_WRAP);
        if(bytes.length<1||bytes.length>196608||offset+bytes.length>size)throw new IOException("附件分块无效");
        File temp=file(c,id,".part"),meta=file(c,id,".json");if(!meta.exists()&&file(c,id,".bin").exists())temp=file(c,id,".bin");
        if(meta.exists()){
            JSONObject info=new JSONObject(readText(meta));if(info.getLong("size")!=size||!info.getString("mime").equals(mime))throw new IOException("附件 ID 已被其他文件使用");
            try(RandomAccessFile in=new RandomAccessFile(file(c,id,".bin"),"r")){in.seek(offset);byte[] existing=new byte[bytes.length];in.readFully(existing);if(!java.util.Arrays.equals(existing,bytes))throw new IOException("附件 ID 已被其他文件使用");}
            return new JSONObject().put("saved",true).put("next_offset",offset+bytes.length);
        }
        try(RandomAccessFile out=new RandomAccessFile(temp,"rw")){
            if(out.length()>offset){if(out.length()<offset+bytes.length)throw new IOException("附件分块冲突");out.seek(offset);byte[] existing=new byte[bytes.length];out.readFully(existing);if(!java.util.Arrays.equals(existing,bytes))throw new IOException("附件分块冲突");}
            else {if(out.length()!=offset)throw new IOException("附件分块顺序不正确，请重新添加");out.seek(offset);out.write(bytes);out.getFD().sync();}
        }
        if(a.optBoolean("final")){
            if(offset+bytes.length!=size)throw new IOException("附件尚未上传完整");
            String preview=a.optString("preview","");
            if(preview.isEmpty()&&mime.startsWith("image/")){
                android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(temp.getPath(),options);
                options.inSampleSize=1;while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>1280)options.inSampleSize*=2;options.inJustDecodeBounds=false;
                android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeFile(temp.getPath(),options);if(bitmap==null)throw new IOException("图片无法解码");
                try{ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,65,out);
                    while(out.size()>280000){android.graphics.Bitmap smaller=android.graphics.Bitmap.createScaledBitmap(bitmap,Math.max(1,bitmap.getWidth()/2),Math.max(1,bitmap.getHeight()/2),true);if(smaller!=bitmap)bitmap.recycle();bitmap=smaller;out.reset();bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG,60,out);}
                    preview="data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);}finally{bitmap.recycle();}
            }if(!preview.isEmpty()&&(!preview.startsWith("data:image/jpeg;base64,")||preview.length()>400000))throw new IOException("图片预览无效");
            JSONObject info=new JSONObject().put("mime",mime).put("size",size).put("preview",preview);
            if(a.has("text"))info.put("text",a.getString("text"));
            File target=file(c,id,".bin");if(!temp.equals(target)&&!temp.renameTo(target))throw new IOException("附件保存失败");
            File metaTemp=file(c,id,".json.tmp");try(FileOutputStream out=new FileOutputStream(metaTemp)){out.write(info.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}if(!metaTemp.renameTo(meta))throw new IOException("附件信息保存失败");
        }
        return new JSONObject().put("saved",a.optBoolean("final")).put("next_offset",offset+bytes.length);
    }
    public static synchronized JSONObject read(Context c,JSONObject a) throws Exception {
        String id=a.getString("id"),mode=a.optString("mode","bytes");int offset=a.has("offset")?a.getInt("offset"):0,limit=a.has("limit")?a.getInt("limit"):49152;
        if((a.has("offset")&&(!(a.get("offset") instanceof Number)||a.getDouble("offset")!=offset))||(a.has("limit")&&(!(a.get("limit") instanceof Number)||a.getDouble("limit")!=limit))||offset<0||limit<1||limit>65536)throw new IOException("offset >= 0，limit 为 1–65536");
        JSONObject info=new JSONObject(readText(file(c,id,".json")));
        if(mode.equals("preview")){String preview=info.optString("preview","");if(preview.isEmpty())throw new IOException("此附件没有图片预览");return new JSONObject().put("mime","image/jpeg").put("data",preview.substring(preview.indexOf(',')+1)).put("encoding","base64").put("complete",true);}
        if(mode.equals("text")){if(!info.has("text"))throw new IOException("此附件没有提取文本，请读取原文件");String text=info.getString("text");int end=Math.min(text.length(),offset+limit);return new JSONObject().put("text",text.substring(Math.min(offset,text.length()),end)).put("total",text.length()).put("next_offset",end<text.length()?end:JSONObject.NULL).put("empty",text.isEmpty());}
        if(!mode.equals("bytes"))throw new IOException("未知读取方式");
        try(RandomAccessFile in=new RandomAccessFile(file(c,id,".bin"),"r")){long total=in.length();int n=(int)Math.min(limit,Math.max(0,total-offset));byte[] bytes=new byte[n];in.seek(Math.min(total,offset));in.readFully(bytes);long end=Math.min(total,(long)offset+n);return new JSONObject().put("mime",info.getString("mime")).put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("encoding","base64").put("total",total).put("offset",offset).put("next_offset",end<total?end:JSONObject.NULL);}
    }
    private static String readText(File f) throws IOException {try(FileInputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);return out.toString(StandardCharsets.UTF_8.name());}}
    public static JSONObject readForAgent(Context c,JSONObject state,JSONObject args) throws Exception {
        JSONArray books=state.getJSONArray("books");for(int b=0;b<books.length();b++){JSONObject book=books.getJSONObject(b);if(!book.getString("id").equals(args.optString("book_id")))continue;
            JSONArray words=book.getJSONArray("words");for(int i=0;i<words.length();i++){JSONObject w=words.getJSONObject(i);if(!w.getString("id").equals(args.optString("word_id")))continue;JSONArray attachments=w.optJSONArray("attachments");if(attachments!=null)for(int j=0;j<attachments.length();j++){JSONObject attachment=attachments.getJSONObject(j);if(attachment.getString("id").equals(args.optString("attachment_id"))){JSONObject readArgs=new JSONObject(args.toString()).put("id",attachment.getString("id"));return read(c,readArgs).put("attachment",attachment).put("book_name",book.getString("name")).put("entry_number",i+1);}}}
        }
        throw new IOException("词库、内容或附件不存在");
    }

    public static void cleanup(Context c,JSONObject state) {
        try {
            java.util.Set<String> used=new java.util.HashSet<>();JSONArray books=state.getJSONArray("books");
            for(int b=0;b<books.length();b++){JSONArray words=books.getJSONObject(b).getJSONArray("words");for(int w=0;w<words.length();w++){JSONArray attachments=words.getJSONObject(w).optJSONArray("attachments");if(attachments!=null)for(int a=0;a<attachments.length();a++)used.add(attachments.getJSONObject(a).getString("id"));}}
            File[] files=new File(c.getFilesDir(),"card-attachments").listFiles();if(files==null)return;long before=System.currentTimeMillis()-7L*86400000;
            for(File f:files){String id=f.getName().split("\\.",2)[0];if(id.matches("att_[a-zA-Z0-9_-]{8,80}")&&!used.contains(id)&&f.lastModified()<before)f.delete();}
        }catch(Exception ignored){} // Cleanup must never invalidate a successful wordbook save.
    }
}
