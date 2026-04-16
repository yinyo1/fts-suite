// ═══ FTS Kiosk — Geolocalización ═══

function getGeolocacion(){
  return new Promise(function(resolve){
    if(!navigator.geolocation){
      resolve({ lat:null, lng:null, error:'GPS no disponible' });
      return;
    }

    // Intento 1: GPS preciso (enableHighAccuracy:true, maximumAge:0)
    navigator.geolocation.getCurrentPosition(
      function(pos){
        resolve({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      function(){
        // Intento 2: fallback menos preciso (WiFi/cell towers)
        navigator.geolocation.getCurrentPosition(
          function(pos){
            resolve({
              lat:      pos.coords.latitude,
              lng:      pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          },
          function(err2){
            resolve({ lat:null, lng:null, error:err2.message });
          },
          { timeout:8000, maximumAge:0, enableHighAccuracy:false }
        );
      },
      { timeout:15000, maximumAge:0, enableHighAccuracy:true }
    );
  });
}

// Calcula distancia en metros entre dos puntos (Haversine)
function distanciaMetros(lat1, lng1, lat2, lng2){
  var R = 6371000;
  var toRad = function(d){ return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

window.getGeolocacion = getGeolocacion;
window.distanciaMetros = distanciaMetros;
