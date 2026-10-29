const { db } = require('./src/db/firebase');

async function fix() {
  const snapshot = await db.collection('appointments').where('emergency_flag', '==', true).get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const existingReq = await db.collection('emergency_requests').doc(doc.id).get();
    if (!existingReq.exists) {
      console.log(`Fixing ${doc.id}`);
      await db.collection('emergency_requests').doc(doc.id).set({
        id: doc.id,
        patient_id: data.patient_email || 'anonymous',
        patient_name: 'Emergency Patient',
        patient_mobile: 'N/A',
        pickup_address: `Lat: ${data.location?.lat}, Lng: ${data.location?.lng}`,
        pickup_lat: data.location?.lat || 0,
        pickup_lng: data.location?.lng || 0,
        status: 'requested',
        description: `Automatic dispatch to ${data.hospital_name}`,
        hospital_id: data.hospital_id,
        hospital_name: data.hospital_name,
        created_at: data.created_at
      });
    }
  }
  console.log('Done!');
  process.exit(0);
}

fix();
