chrome.runtime.onInstalled.addListener(() => {
chrome.storage.local.set({
llmDetectorEnabled: true,
llmDetectorIgnoredHosts: []
});
});

