export async function GET() {
  const apiKey = process.env.CALENDLY_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "CALENDLY_API_KEY not set" }, { status: 500 });
  }

  try {
    // First get current user to find organization URI
    const userResponse = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!userResponse.ok) {
      const err = await userResponse.text();
      return Response.json({ error: "Calendly user lookup failed", status: userResponse.status, details: err });
    }

    const userData = await userResponse.json();
    const userUri = userData.resource?.uri;

    if (!userUri) {
      return Response.json({ error: "Could not determine user URI" });
    }

    // Fetch event types
    const eventsResponse = await fetch(
      `https://api.calendly.com/event_types?user=${encodeURIComponent(userUri)}&active=true`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!eventsResponse.ok) {
      const err = await eventsResponse.text();
      return Response.json({ error: "Event types fetch failed", status: eventsResponse.status, details: err });
    }

    const eventsData = await eventsResponse.json();
    return Response.json({
      eventTypes: eventsData.collection?.map((et: { name: string; scheduling_url: string; slug: string; active: boolean }) => ({
        name: et.name,
        scheduling_url: et.scheduling_url,
        slug: et.slug,
        active: et.active,
      })),
    });
  } catch (err) {
    return Response.json({ error: "Request failed", details: String(err) }, { status: 500 });
  }
}
