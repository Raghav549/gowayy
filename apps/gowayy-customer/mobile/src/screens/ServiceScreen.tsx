/**
 * Dedicated, functional service flows. Each route (/cabs, /hotels, /food, …)
 * renders this factory with its own configuration, but every button creates a real
 * server-authoritative booking or order and then continues to payment.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { client, idemKey } from '../lib/client';
import { useJourney } from '../store/useJourney';
import { useCart } from '../store/useCart';
import { useUI } from '../store/useUI';
import { Button, Card, DemoBanner, Field, Money, Photo, Picker, Screen, SectionTitle, TextInput } from '../components/UI';
import { openNavigationHandoff } from '../lib/location';
import { useTheme, spacing, radius, font } from '../theme';
import type { CatalogBundle } from '@gowayy/api-client';

export type ServiceKind = 'cabs' | 'hotels' | 'food' | 'groceries' | 'tourism' | 'experiences' | 'packages' | 'parcels';

const CONFIG: Record<ServiceKind, { title: string; eyebrow: string; body: string }> = {
  cabs: { title: 'Book a cab', eyebrow: 'Transport', body: 'Private cabs, airport transfers and shared-taxi seats with server-priced fares.' },
  hotels: { title: 'Book your stay', eyebrow: 'Hospitality', body: 'Hotels, homestays and lodges with real per-night room availability.' },
  food: { title: 'Order food', eyebrow: 'Restaurants', body: 'Browse a real menu, customise items and place an order.' },
  groceries: { title: 'Shop groceries', eyebrow: 'Local stores', body: 'Each store has independent stock and its own delivery coverage.' },
  tourism: { title: 'Sightseeing', eyebrow: 'Tourism', body: 'Attractions and local sightseeing, connected to your journey.' },
  experiences: { title: 'Local experiences', eyebrow: 'Experiences', body: 'Host-led experiences with transparent pricing.' },
  packages: { title: 'Tour packages', eyebrow: 'Packages', body: 'Bundled sightseeing itineraries with published inclusions.' },
  parcels: { title: 'Send a parcel', eyebrow: 'Delivery', body: 'Point-to-point parcel delivery priced by distance and weight.' },
};

const isoDate = (offset: number) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function ServiceScreen({ kind }: { kind: ServiceKind }) {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const { c } = useTheme();
  const journey = useJourney((s) => s.journey);
  const patchJourney = useJourney((s) => s.patch);
  const showToast = useUI((s) => s.showToast);
  const cart = useCart();
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
  const data = catalog.data;
  const cfg = CONFIG[kind];

  // Shared selectors
  const places = data?.places ?? [];
  const [pickupId, setPickupId] = useState('');
  const [dropoffId, setDropoffId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [tripType, setTripType] = useState('one_way');
  const [passengers, setPassengers] = useState('2');
  const [scheduledAt, setScheduledAt] = useState('');
  const [sharedMode, setSharedMode] = useState(false);
  const [sharedRouteId, setSharedRouteId] = useState(params.shared ?? '');
  const [seats, setSeats] = useState('1');
  const [departureTime, setDepartureTime] = useState('');

  const [propertyId, setPropertyId] = useState(params.property ?? '');
  const [roomId, setRoomId] = useState('');
  const [checkIn, setCheckIn] = useState(isoDate(1));
  const [checkOut, setCheckOut] = useState(isoDate(3));
  const [adults, setAdults] = useState('2');
  const [children, setChildren] = useState('0');
  const [rooms, setRooms] = useState('1');
  const [guestName, setGuestName] = useState('');

  const [listingId, setListingId] = useState(params.restaurant ?? params.store ?? '');
  const [address, setAddress] = useState('');
  const [instructions, setInstructions] = useState('');
  const [coupon, setCoupon] = useState('');
  const [substitution, setSubstitution] = useState('contact_me');
  const [slot, setSlot] = useState('');
  const [search, setSearch] = useState('');

  const [offeringId, setOfferingId] = useState(params.attraction ?? params.offering ?? '');
  const [date, setDate] = useState(isoDate(2));
  const [guests, setGuests] = useState('2');

  const [weightKg, setWeightKg] = useState('1');
  const [description, setDescription] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = useQuery({
    queryKey: ['route', pickupId, dropoffId, vehicleId],
    queryFn: () => client.estimateRoute(pickupId, dropoffId, vehicleId || undefined),
    enabled: Boolean(pickupId && dropoffId && !sharedMode && (kind === 'cabs' || kind === 'parcels')),
  });

  const selectedProperty = data?.properties.find((p) => p.id === propertyId);
  const selectedRoom = selectedProperty?.rooms.find((r) => r.id === roomId);
  const isFood = kind === 'food';
  const stores = data?.stores ?? [];
  const restaurants = data?.restaurants ?? [];
  const selectedListing = isFood ? restaurants.find((r) => r.id === listingId) : stores.find((s) => s.id === listingId);
  const menu = useMemo(() => {
    if (!selectedListing) return [];
    if ('menu' in selectedListing) return selectedListing.menu.filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()));
    return selectedListing.products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())).map((p) => ({
      id: p.id, name: `${p.name} · ${p.unit}`, description: `${p.category} · ${p.stock} in stock`,
      pricePaise: p.pricePaise, category: p.category, vegetarian: true, customizations: [], available: p.stock > 0,
    }));
  }, [selectedListing, search]);
  const offerings = kind === 'tourism' ? (data?.attractions ?? [])
    : kind === 'experiences' ? (data?.experiences ?? []) : (data?.packages ?? []);
  const selectedOffering = offerings.find((o) => o.id === offeringId);

  const placeOptions = places.map((p) => ({ id: p.id, label: p.name, sub: p.locality }));
  const setJourneyContext = async (extra: Record<string, unknown> = {}) => {
    await patchJourney({
      ...extra,
      ...(pickupId && dropoffId ? { pickup: places.find((p) => p.id === pickupId), dropoff: places.find((p) => p.id === dropoffId) } : {}),
    });
  };

  async function submitBooking(kindName: string, call: () => Promise<{ id: string }>) {
    setBusy(true); setError(null);
    try {
      const created = await call();
      await setJourneyContext({ serviceIds: [kindName] });
      router.push({ pathname: '/checkout', params: { bookingId: created.id } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create this booking.'); }
    finally { setBusy(false); }
  }
  async function submitOrder(call: () => Promise<{ id: string }>) {
    setBusy(true); setError(null);
    try {
      const created = await call();
      cart.clear();
      router.push({ pathname: '/checkout', params: { orderId: created.id } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not place this order.'); }
    finally { setBusy(false); }
  }

  const cartItems = cart.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPricePaise: i.unitPricePaise, options: i.options ?? [] }));

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: c.accent }]}>{cfg.eyebrow.toUpperCase()}</Text>
        <Text style={[styles.title, { color: c.text }]}>{cfg.title}</Text>
        <Text style={[styles.body, { color: c.textMuted }]}>{cfg.body}</Text>
      </View>
      {journey?.destinationId ? <Card><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>CONNECTED JOURNEY</Text>
        <Text style={{ color: c.text, fontWeight: '600' }}>{journey.title}</Text>
        <Button title="Open journey" variant="ghost" onPress={() => router.push({ pathname: '/journey/[id]', params: { id: journey.id } })} /></Card> : null}
      <DemoBanner>Sandbox data. Availability, pricing and booking status come from the server; nothing is confirmed on the device.</DemoBanner>

      {kind === 'cabs' ? <>
        <Picker label="Mode" options={[{ id: 'private', label: 'Private cab' }, { id: 'shared', label: 'Shared taxi' }]} value={sharedMode ? 'shared' : 'private'} onChange={(id) => setSharedMode(id === 'shared')} />
        {sharedMode ? <>
          <Picker label="Designated route" options={(data?.sharedRoutes ?? []).map((r) => ({ id: r.id, label: r.stand, sub: `${r.departureTimes.slice(0, 2).join(', ')} · ${r.seatsTotal} seats` }))}
            value={sharedRouteId || data?.sharedRoutes[0]?.id || ''} onChange={setSharedRouteId} />
          <Picker label="Departure" options={(data?.sharedRoutes.find((r) => r.id === (sharedRouteId || data?.sharedRoutes[0]?.id))?.departureTimes ?? []).map((t) => ({ id: t, label: t }))}
            value={departureTime || data?.sharedRoutes.find((r) => r.id === (sharedRouteId || data?.sharedRoutes[0]?.id))?.departureTimes[0] || ''} onChange={setDepartureTime} />
          <Field label="Seats"><TextInput value={seats} onChangeText={setSeats} keyboardType="numeric" /></Field>
          <Card><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Operator-defined price and permit note</Text>
            <Money paise={data?.sharedRoutes.find((r) => r.id === (sharedRouteId || data?.sharedRoutes[0]?.id))?.pricePaise ?? 0} />
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{data?.sharedRoutes.find((r) => r.id === (sharedRouteId || data?.sharedRoutes[0]?.id))?.permitNote}</Text></Card>
          <Button title="Reserve seats" loading={busy} onPress={() => void submitBooking('shared_taxi', () => client.bookSharedTaxi({
            routeId: sharedRouteId || data?.sharedRoutes[0]?.id, seats: Number(seats),
            departureTime: departureTime || data?.sharedRoutes.find((r) => r.id === (sharedRouteId || data?.sharedRoutes[0]?.id))?.departureTimes[0],
            journeyId: journey?.id ?? null,
          }, idemKey()))} />
        </> : <>
          <Picker label="Pickup" options={placeOptions} value={pickupId || placeOptions[0]?.id || ''} onChange={setPickupId} />
          <Picker label="Destination" options={placeOptions} value={dropoffId || placeOptions[1]?.id || ''} onChange={setDropoffId} />
          <Picker label="Vehicle" options={(data?.vehicles ?? []).map((v) => ({ id: v.id, label: v.name, sub: `${v.seats} seats` }))} value={vehicleId || data?.vehicles[0]?.id || ''} onChange={setVehicleId} />
          <Picker label="Trip" options={[{ id: 'one_way', label: 'One way' }, { id: 'round_trip', label: 'Round trip' }]} value={tripType} onChange={setTripType} />
          <Field label="Passengers"><TextInput value={passengers} onChangeText={setPassengers} keyboardType="numeric" /></Field>
          <Field label="Schedule (optional, YYYY-MM-DDTHH:mm)" hint="Leave empty for an immediate booking."><TextInput value={scheduledAt} onChangeText={setScheduledAt} autoCapitalize="none" /></Field>
          {estimate.data ? <Card>
            <Text style={[styles.eyebrow, { color: c.accent }]}>ROUTE ESTIMATE</Text>
            <Text style={{ color: c.text }}>{estimate.data.route.distanceKm} km · {estimate.data.route.durationMin} min · {estimate.data.route.provider}</Text>
            <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{estimate.data.route.note}</Text>
            <Button title="Open navigation handoff" variant="ghost" onPress={() => {
              const from = places.find((p) => p.id === (pickupId || placeOptions[0]?.id));
              const to = places.find((p) => p.id === (dropoffId || placeOptions[1]?.id));
              if (to) void openNavigationHandoff(from ? { lat: from.lat, lng: from.lng } : null, { lat: to.lat, lng: to.lng });
            }} />
          </Card> : null}
          <Button title="Book cab (server priced)" loading={busy} onPress={() => void submitBooking('cab', () => client.bookCab({
            pickupId: pickupId || placeOptions[0]?.id, dropoffId: dropoffId || placeOptions[1]?.id,
            vehicleClassId: vehicleId || data?.vehicles[0]?.id, tripType,
            scheduledAt: scheduledAt || null, passengers: Number(passengers) || 1, journeyId: journey?.id ?? null,
          }, idemKey()))} />
        </>}
      </> : null}

      {kind === 'hotels' ? <>
        <Picker label="Property" options={(data?.properties ?? []).map((p) => ({ id: p.id, label: p.name, sub: p.propertyType }))} value={propertyId || data?.properties[0]?.id || ''} onChange={(id) => { setPropertyId(id); setRoomId(''); }} />
        {selectedProperty ? <Photo path={selectedProperty.image.status === 'verified' ? selectedProperty.image.assetPath : undefined} alt={selectedProperty.image.alt} /> : null}
        <Picker label="Room" options={(selectedProperty?.rooms ?? (data?.properties.find((p) => p.id === (propertyId || data?.properties[0]?.id))?.rooms) ?? []).map((r) => ({ id: r.id, label: r.name, sub: `${r.totalRooms} rooms` }))}
          value={roomId || selectedProperty?.rooms[0]?.id || data?.properties.find((p) => p.id === (propertyId || data?.properties[0]?.id))?.rooms[0]?.id || ''} onChange={setRoomId} />
        <Field label="Check-in (YYYY-MM-DD)"><TextInput value={checkIn} onChangeText={setCheckIn} autoCapitalize="none" /></Field>
        <Field label="Check-out (YYYY-MM-DD)"><TextInput value={checkOut} onChangeText={setCheckOut} autoCapitalize="none" /></Field>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Field label="Adults"><TextInput value={adults} onChangeText={setAdults} keyboardType="numeric" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Children"><TextInput value={children} onChangeText={setChildren} keyboardType="numeric" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Rooms"><TextInput value={rooms} onChangeText={setRooms} keyboardType="numeric" /></Field></View>
        </View>
        <Field label="Guest name"><TextInput value={guestName} onChangeText={setGuestName} placeholder="Name on the booking" /></Field>
        {selectedProperty ? <Card><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>HOUSE RULES</Text><Text style={{ color: c.text }}>{selectedProperty.houseRules}</Text>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{selectedProperty.cancellationPolicy}</Text></Card> : null}
        <Button title="Request booking" loading={busy} onPress={() => void submitBooking('hotel', () => client.bookStay({
          propertyId: propertyId || data?.properties[0]?.id,
          roomId: roomId || selectedProperty?.rooms[0]?.id || data?.properties.find((p) => p.id === (propertyId || data?.properties[0]?.id))?.rooms[0]?.id,
          checkIn, checkOut, adults: Number(adults) || 1, children: Number(children) || 0, rooms: Number(rooms) || 1,
          guestName: guestName.trim(), journeyId: journey?.id ?? null,
        }, idemKey()))} />
      </> : null}

      {kind === 'food' || kind === 'groceries' ? <>
        <Picker label={isFood ? 'Restaurant' : 'Local store'} options={isFood
            ? restaurants.map((r) => ({ id: r.id, label: r.name, sub: r.cuisines.join(', ') }))
            : stores.map((st) => ({ id: st.id, label: st.name, sub: `${st.destinationId} · ${st.deliveryCoverageKm} km` }))}
          value={listingId || (isFood ? restaurants[0]?.id : stores[0]?.id) || ''} onChange={(id) => { setListingId(id); cart.clear(); }} />
        {selectedListing ? <>
          <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>{selectedListing.description}</Text>
          <Field label="Search items"><TextInput value={search} onChangeText={setSearch} placeholder={isFood ? 'Momos, thukpa…' : 'Milk, rice…'} autoCapitalize="none" /></Field>
          {menu.map((m) => (
            <Pressable key={m.id} onPress={() => cart.add({ id: m.id, name: m.name, quantity: 1, unitPricePaise: m.pricePaise, options: [] })}
              style={[styles.item, { borderColor: c.border, backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel={`Add ${m.name}`}>
              <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '600' }}>{m.name}</Text><Text style={{ color: c.textMuted, fontSize: font.sizes.xs }} numberOfLines={2}>{m.description}</Text></View>
              <Money paise={m.pricePaise} />
              <Ionicons name="add-circle-outline" size={22} color={c.accent} />
            </Pressable>
          ))}
          {cart.items.length ? <Card>
            <Text style={{ color: c.text, fontWeight: '700' }}>Cart · {cart.items.length} items</Text>
            {cart.items.map((i) => (
              <View key={i.id} style={styles.cartRow}>
                <Text style={{ color: c.text, flex: 1 }}>{i.quantity} × {i.name}</Text>
                <Money paise={i.quantity * i.unitPricePaise} />
                <Pressable onPress={() => cart.remove(i.id)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={c.textMuted} /></Pressable>
              </View>
            ))}
            <Text style={{ color: c.accent, fontWeight: '700' }}>Subtotal <Money paise={cart.subtotalPaise()} /></Text>
          </Card> : null}
          <Field label="Delivery address"><TextInput value={address} onChangeText={setAddress} placeholder="Street, locality, town" multiline /></Field>
          <Field label="Instructions" hint="Optional"><TextInput value={instructions} onChangeText={setInstructions} multiline /></Field>
          <Field label="Coupon (optional)"><TextInput value={coupon} onChangeText={setCoupon} autoCapitalize="characters" /></Field>
          {!isFood ? <>
            <Picker label="Substitution" options={[{ id: 'allow', label: 'Allow' }, { id: 'contact_me', label: 'Ask me' }, { id: 'no_substitutes', label: 'None' }]} value={substitution} onChange={setSubstitution} />
            <Picker label="Delivery slot" options={(selectedListing as { slots?: string[] }).slots?.map((s) => ({ id: s, label: s })) ?? []} value={slot} onChange={setSlot} />
          </> : null}
          <Button title="Place order" loading={busy} disabled={!cart.items.length} onPress={() => void submitOrder(() => client.placeOrder({
            service: isFood ? 'food' : 'grocery', listingId: listingId || (isFood ? restaurants[0]?.id : stores[0]?.id),
            items: cartItems, deliveryAddress: address.trim(), instructions: instructions.trim(),
            slot: slot || null, coupon: coupon.trim() || null, substitution, journeyId: journey?.id ?? null,
          }, idemKey()))} />
        </> : <SkeletonList rows={4} />}
      </> : null}

      {kind === 'tourism' || kind === 'experiences' || kind === 'packages' ? <>
        <Picker label={kind === 'tourism' ? 'Attraction' : kind === 'experiences' ? 'Experience' : 'Package'}
          options={offerings.map((o) => ({ id: o.id, label: o.name, sub: 'description' in o ? String(o.description).slice(0, 50) : undefined }))}
          value={offeringId || offerings[0]?.id || ''} onChange={setOfferingId} />
        {selectedOffering ? <Card>
          <Text style={{ color: c.text, fontSize: font.sizes.base }}>{'description' in selectedOffering ? String(selectedOffering.description) : ''}</Text>
          {'includes' in selectedOffering && Array.isArray(selectedOffering.includes) ? <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Includes: {selectedOffering.includes.join(', ')}</Text> : null}
          {'pricePaise' in selectedOffering ? <Money paise={Number(selectedOffering.pricePaise)} /> : <Text style={{ color: c.textMuted, fontSize: font.sizes.xs }}>Free / at-site entry; price is shown at checkout.</Text>}
          {'coords' in selectedOffering && selectedOffering.coords ? <Button title="Open navigation handoff" variant="ghost" onPress={() => {
            const coords = selectedOffering.coords as { lat: number; lng: number };
            void openNavigationHandoff(null, coords);
          }} /> : null}
        </Card> : null}
        <Field label="Date (YYYY-MM-DD)"><TextInput value={date} onChangeText={setDate} autoCapitalize="none" /></Field>
        <Field label="Guests / travellers"><TextInput value={guests} onChangeText={setGuests} keyboardType="numeric" /></Field>
        <Button title="Book this service" loading={busy} onPress={() => void submitBooking(kind === 'tourism' ? 'tourism' : kind === 'experiences' ? 'experience' : 'package', () => client.bookTourism({
          offeringId: offeringId || offerings[0]?.id, service: kind === 'tourism' ? 'tourism' : kind === 'experiences' ? 'experience' : 'package',
          date, guests: Number(guests) || 1, journeyId: journey?.id ?? null,
        }, idemKey()))} />
      </> : null}

      {kind === 'parcels' ? <>
        <Picker label="Pickup point" options={placeOptions} value={pickupId || placeOptions[0]?.id || ''} onChange={setPickupId} />
        <Picker label="Delivery point" options={placeOptions} value={dropoffId || placeOptions[1]?.id || ''} onChange={setDropoffId} />
        {estimate.data ? <Card><Text style={{ color: c.text }}>{estimate.data.route.distanceKm} km · {estimate.data.route.durationMin} min</Text></Card> : null}
        <Field label="Weight (kg)"><TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" /></Field>
        <Field label="Parcel description"><TextInput value={description} onChangeText={setDescription} multiline /></Field>
        <Field label="Recipient phone (10 digits)"><TextInput value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" /></Field>
        <Button title="Book parcel delivery" loading={busy} onPress={() => void submitBooking('parcel', () => client.bookParcel({
          pickupId: pickupId || placeOptions[0]?.id, dropoffId: dropoffId || placeOptions[1]?.id,
          weightKg: Number(weightKg) || 1, description: description.trim(), recipientPhone: recipientPhone.trim(), journeyId: journey?.id ?? null,
        }, idemKey()))} />
      </> : null}

      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <SectionTitle eyebrow="After booking" title="Keep the journey connected" />
      <View style={styles.links}>
        <Button title="Bookings & status" variant="secondary" onPress={() => router.push('/bookings')} />
        <Button title="Journey dashboard" variant="secondary" onPress={() => journey ? router.push({ pathname: '/journey/[id]', params: { id: journey.id } }) : showToast('Choose a destination first.')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: font.sizes.xs, letterSpacing: 1.6, fontWeight: '700' },
  title: { fontSize: font.sizes['2xl'], fontWeight: '800', marginTop: 2 },
  body: { fontSize: font.sizes.sm, lineHeight: 20, marginTop: 3 },
  row: { flexDirection: 'row', gap: spacing.sm },
  item: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  error: { color: '#B45B4C', fontSize: font.sizes.sm },
  links: { gap: spacing.sm, marginBottom: spacing.xl },
});
