const { db } = require('./src/db/firebase');

const seedHospitals = async () => {
  const hospitals = [
    { id: 'h1', name: "U.V.S.M. Eye Hospital", lat: 16.5495, lng: 81.5268, contact: "08816-123451" },
    { id: 'h2', name: "Mohan Hospital", lat: 16.5295, lng: 81.5118, contact: "08816-123452" },
    { id: 'h3', name: "Subhadra Surgical Centre", lat: 16.5345, lng: 81.5318, contact: "08816-123453" },
    { id: 'h4', name: "Q Nirvana General Hospital", lat: 16.5445, lng: 81.5218, contact: "08816-111111" },
  ];

  for (const h of hospitals) {
    await db.collection('hospitals').doc(h.id).set({
      ...h,
      icu_beds_available: 5,
      created_at: new Date().toISOString()
    });

    // Add 5 ICU beds for each
    for (let i = 1; i <= 5; i++) {
      const bedId = `icu_${h.id}_${i}`;
      await db.collection('hospital_beds').doc(bedId).set({
        id: bedId,
        hospital_id: h.id,
        bed_type: 'icu',
        ward_name: 'Emergency ICU',
        room_number: `R-ICU-${i}`,
        bed_number: `B-${i}`,
        status: 'available',
        charge_per_day: 5000,
        created_at: new Date().toISOString()
      });
    }

    // Add 2 emergency doctors for each
    const doctors = [
      { id: `dr_${h.id}_1`, name: `Dr. Sarah (ER - ${h.name})`, spec: 'Emergency Medicine' },
      { id: `dr_${h.id}_2`, name: `Dr. Mike (Trauma - ${h.name})`, spec: 'Trauma Surgery' },
    ];

    for (const dr of doctors) {
      await db.collection('doctor_profiles').doc(dr.id).set({
        id: dr.id,
        hospital_id: h.id,
        full_name: dr.name,
        specialization: dr.spec,
        status: 'active',
        is_emergency: true
      });
    }
  }
  console.log("Seed data created successfully!");
  process.exit();
};

seedHospitals();
