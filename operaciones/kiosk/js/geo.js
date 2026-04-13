// ═══ FTS Kiosk — Geolocalización ═══

function getGeolocacion(){
  return new Promise((resolve) => {
    if(!navigator.geolocation){
      resolve({ lat:null, lng:null, error:'no_geo' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat:      pos.coords.latitude,
        lng:      pos.coords.longitude,
        accuracy: pos.coords.accuracy
      }),
      err => resolve({ lat:null, lng:null, error:err.message }),
      { timeout:8000, maximumAge:60000, enableHighAccuracy:false }
    );
  });
}

// Calcula distancia en metros entre dos puntos (Haversine)
function distanciaMetros(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window.getGeolocacion = getGeolocacion;
window.distanciaMetros = distanciaMetros;
