(() => {
  "use strict";

  const shareButton = document.getElementById("shareVideoFile");
  const shareStatus = document.getElementById("videoShareStatus");
  const copyButton = document.getElementById("copyVideoLink");
  const linkInput = document.getElementById("videoLink");
  const copyStatus = document.getElementById("copyVideoStatus");
  const videoPath = "assets/videos/palladium-tour.mp4";
  let videoFile = null;
  let preparing = false;

  if (copyButton && linkInput) {
    copyButton.hidden = false;
    copyButton.addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(linkInput.value);
        copyStatus.textContent = "Video link copied.";
      } catch {
        linkInput.focus();
        linkInput.select();
        copyStatus.textContent = "Copy the selected video link.";
      }
    });
  }

  if (!shareButton || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return;
  shareButton.hidden = false;
  document.getElementById("nativeShareHelp").hidden = false;

  shareButton.addEventListener("click", async () => {
    if (preparing) return;

    if (!videoFile) {
      preparing = true;
      shareButton.disabled = true;
      shareButton.textContent = "Preparing video…";
      shareStatus.textContent = "Getting the video ready for sharing.";
      try {
        const response = await fetch(videoPath);
        if (!response.ok) throw new Error("Video unavailable");
        const blob = await response.blob();
        if (!blob.size) throw new Error("Empty video");
        const file = new File([blob], "palladium-tour.mp4", { type: "video/mp4" });
        if (!navigator.canShare({ files: [file] })) {
          shareButton.hidden = true;
          document.getElementById("nativeShareHelp").hidden = true;
          shareStatus.textContent = "Download the video, then upload it to Instagram as a Reel or Story.";
          return;
        }
        videoFile = file;
        shareButton.textContent = "Share video";
        shareStatus.textContent = "Video ready. Tap Share video and choose Instagram if it appears in your sharing menu.";
      } catch {
        shareButton.textContent = "Try preparing again";
        shareStatus.textContent = "The video could not be prepared. Try again or use Download video.";
      } finally {
        preparing = false;
        shareButton.disabled = false;
      }
      return;
    }

    // A separate click keeps native sharing inside a fresh user gesture.
    // Share the MP4 file itself, without replacing it with a website URL.
    shareButton.disabled = true;
    try {
      await navigator.share({ files: [videoFile] });
      shareStatus.textContent = "Video passed to your sharing menu. Finish posting in your chosen app.";
    } catch (error) {
      shareStatus.textContent = error.name === "AbortError"
        ? "Sharing cancelled. You can try again or download the video."
        : "Sharing is unavailable here. Download the video and upload it to Instagram.";
    } finally {
      shareButton.disabled = false;
    }
  });
})();
