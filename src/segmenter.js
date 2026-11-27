// MediaPipe Interactive Segmenter ("magic touch"): given a point on the photo,
// returns the region the model thinks belongs with it. Runs in the browser;
// the photo is not sent anywhere. The library and the model are downloaded on
// first use.
const VERSION = '0.10.14';
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';

let loading = null;
function load() {
  if (!loading) {
    loading = (async () => {
      const { FilesetResolver, InteractiveSegmenter } = await import(BUNDLE);
      const files = await FilesetResolver.forVisionTasks(WASM);
      const create = (delegate) => InteractiveSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      try {
        return await create('GPU');
      } catch {
        return create('CPU');
      }
    })();
    loading.catch(() => { loading = null; }); // allow a retry
  }
  return loading;
}

// Category mask for the point (u, v: 0..1) of `image` (a canvas):
// { data: Uint8Array (one byte per pixel), width, height }. Rejects when the
// library or the model cannot be loaded.
export async function segmentAt(image, u, v) {
  const segmenter = await load();
  let found = null;
  segmenter.segment(image, { keypoint: { x: u, y: v } }, (result) => {
    const mask = result.categoryMask; // valid only inside this callback
    found = { data: mask.getAsUint8Array().slice(), width: mask.width, height: mask.height };
  });
  if (!found) throw new Error('no segmentation result');
  return found;
}
