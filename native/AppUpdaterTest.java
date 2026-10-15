package com.rtc.worddictation;
import static org.junit.Assert.*;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class AppUpdaterTest {
 @SuppressWarnings("deprecation") @Test public void opensSystemInstallerWithReadGrantAndReturnResult(){
  Uri uri=Uri.parse("content://com.rtc.worddictation.updater/updates/word-dictation-update.apk");
  Intent intent=AppUpdaterPlugin.systemInstallIntent(uri);
  assertEquals(Intent.ACTION_INSTALL_PACKAGE,intent.getAction());assertEquals(uri,intent.getData());
  assertEquals("application/vnd.android.package-archive",intent.getType());assertNotEquals(0,intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION);
  assertEquals(0,intent.getFlags()&Intent.FLAG_ACTIVITY_NEW_TASK);assertEquals(uri,intent.getClipData().getItemAt(0).getUri());assertTrue(intent.getBooleanExtra(Intent.EXTRA_RETURN_RESULT,false));
 }
 @Test public void explicitlyGrantsReadOnlyAccessToInstallerAndOemParsingDelegate() throws Exception {
  android.content.Context base=RuntimeEnvironment.getApplication();
  android.content.pm.PackageManager pm=base.getPackageManager();
  Uri uri=Uri.parse("content://com.rtc.worddictation.updater/updates/test.apk");
  Intent intent=AppUpdaterPlugin.systemInstallIntent(uri);
  android.content.pm.ResolveInfo handler=new android.content.pm.ResolveInfo();
  handler.activityInfo=new android.content.pm.ActivityInfo();handler.activityInfo.packageName="test.installer";handler.activityInfo.name="Installer";
  org.robolectric.Shadows.shadowOf(pm).addResolveInfoForIntent(intent,handler);
  android.content.pm.PackageInfo oem=new android.content.pm.PackageInfo();oem.packageName="com.miui.packageinstaller";
  oem.applicationInfo=new android.content.pm.ApplicationInfo();oem.applicationInfo.packageName=oem.packageName;oem.applicationInfo.flags=android.content.pm.ApplicationInfo.FLAG_SYSTEM;
  org.robolectric.Shadows.shadowOf(pm).installPackage(oem);
  java.util.Set<String> granted=new java.util.HashSet<>();
  android.content.Context context=new android.content.ContextWrapper(base){
   @Override public void grantUriPermission(String name,Uri grantedUri,int flags){assertEquals(uri,grantedUri);assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION,flags);granted.add(name);}
  };
  java.util.Set<String> targets=AppUpdaterPlugin.grantInstallerReadAccess(context,intent);
  assertTrue(targets.contains("test.installer"));assertTrue(targets.contains("com.miui.packageinstaller"));assertEquals(targets,granted);
  assertFalse(targets.contains("com.google.android.packageinstaller"));
 }
 @Test public void downloadedApkCanBeReadThroughNarrowFileProvider() throws Exception {
  android.content.Context context=RuntimeEnvironment.getApplication();
  java.io.File dir=new java.io.File(context.getFilesDir(),"updates");dir.mkdirs();java.io.File file=new java.io.File(dir,"probe.apk");
  try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(new byte[]{1,2,3});}
  Uri uri=androidx.core.content.FileProvider.getUriForFile(context,context.getPackageName()+".updater",file);
  try(java.io.InputStream in=context.getContentResolver().openInputStream(uri)){assertNotNull(in);assertEquals(1,in.read());}
  try {androidx.core.content.FileProvider.getUriForFile(context,context.getPackageName()+".updater",new java.io.File(context.getFilesDir(),"private-state.json"));fail("private app files must not be exposed");}catch(IllegalArgumentException expected){}
 }
 @Test public void failureReasonIsNotTruncatedOrInvented(){
  String full="INSTALL_FAILED_ABORTED: User rejected permissions "+new String(new char[500]).replace('\0','x');
  String detail=AppUpdaterPlugin.resultDetail(Activity.RESULT_CANCELED,new Intent().putExtra(PackageInstaller.EXTRA_STATUS_MESSAGE,full).putExtra("android.intent.extra.INSTALL_RESULT",-115));
  assertTrue(detail.contains(full));assertTrue(detail.contains("installResult=-115"));assertTrue(detail.contains("可能取消或被拦截"));
  assertFalse(AppUpdaterPlugin.resultDetail(Activity.RESULT_CANCELED,null).contains("安装成功"));
 }
 @Test public void absentLegacyCallbackStatusIsNotReportedAsFailure(){
  Robolectric.buildActivity(InstallResultActivity.class,new Intent()).create();
  assertEquals("result_missing",RuntimeEnvironment.getApplication().getSharedPreferences("word_dictation_updater",0).getString("stage",""));
 }
}
