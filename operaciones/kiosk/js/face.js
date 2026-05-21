// ═══ FTS Kiosk — Verificación facial con face-api.js ═══

const FACE_THRESHOLD = parseFloat(localStorage.getItem('ops_kiosk_face_threshold') || '0.5');
// jsdelivr-npm dejó de servir /weights del paquete 0.22.2 (404 confirmado 21-may-2026).
// Cambio a jsdelivr-gh (sirve el repo source directamente) — 7/7 assets verificados 200 OK.
// Override opcional via localStorage.ops_kiosk_face_models_url (testing local con server propio).
const FACE_MODELS_URL = localStorage.getItem('ops_kiosk_face_models_url') ||
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

let faceModelsLoaded = false;

async function loadFaceModels(){
  if(faceModelsLoaded) return;
  if(typeof faceapi === 'undefined'){
    throw new Error('face-api.js no cargado');
  }
  await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL);
  await faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL);
  faceModelsLoaded = true;
}

async function getDescriptor(input){
  // input: HTMLImageElement o HTMLVideoElement
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize:224, scoreThreshold:0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return detection ? detection.descriptor : null;
}

async function compareFaces(referenceImg, videoEl){
  // referenceImg: URL (data: o http) de la foto del empleado
  // videoEl: <video> con stream de webcam
  if(!referenceImg){
    return { match:false, distance:1, similarity:0, reason:'no_reference' };
  }
  try{
    const img = await faceapi.fetchImage(referenceImg);
    const refDescriptor = await getDescriptor(img);
    const liveDescriptor = await getDescriptor(videoEl);

    if(!refDescriptor){
      return { match:false, distance:1, similarity:0, reason:'no_ref_face' };
    }
    if(!liveDescriptor){
      return { match:false, distance:1, similarity:0, reason:'no_live_face' };
    }

    const distance = faceapi.euclideanDistance(refDescriptor, liveDescriptor);
    const threshold = parseFloat(localStorage.getItem('ops_kiosk_face_threshold') || '0.5');
    const match = distance < threshold;
    const similarity = Math.max(0, Math.round((1 - distance) * 100));

    return { match, distance, similarity };
  } catch(e){
    console.error('compareFaces error:', e);
    return { match:false, distance:1, similarity:0, reason:'error:'+e.message };
  }
}

window.FaceVerify = { loadFaceModels, compareFaces };
