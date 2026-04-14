import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Downloads a file from base64 data.
 * On Web: Uses the standard HTML5 <a> download approach.
 * On Native (Android/iOS): Uses Capacitor Filesystem & Share plugins.
 */
export async function downloadNativeOrWeb(base64Data: string, filename: string, mimeType: string = 'application/octet-stream') {
  if (Capacitor.isNativePlatform()) {
    try {
      // Create a clean base64 string without the prefix (e.g., "data:image/png;base64,")
      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }

      // Write the file to the app's cache directory
      const writeFileResult = await Filesystem.writeFile({
        path: filename,
        data: cleanBase64,
        directory: Directory.Cache,
      });

      // Share or Save the file using the device's native dialog
      await Share.share({
        title: filename,
        url: writeFileResult.uri,
        dialogTitle: 'Save or Share File',
      });

    } catch (error) {
      console.error('Failed to save file natively:', error);
      alert("Download Error: " + (error as Error).message);
      throw new Error(`Native download failed: ${(error as Error).message}`);
    }
  } else {
    // Web fallback
    try {
      // If it already has the prefix, use directly, otherwise construct
      let dataUrl = base64Data;
      if (!dataUrl.startsWith('data:')) {
        dataUrl = `data:${mimeType};base64,${base64Data}`;
      }

      // We convert dataUrl back to a true Blob so the browser actually triggers a download UI 
      // instead of attempting to open large data URIs dynamically
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (webError) {
      console.error('Failed to save file on web:', webError);
      throw new Error('Web download failed.');
    }
  }
}
