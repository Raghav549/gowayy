/** Dedicated food interface. Reuses the shared service engine, so business logic is identical on web and Android. */
import { ServiceScreen } from '../src/screens/ServiceScreen';
export default function FoodScreen() { return <ServiceScreen kind="food" />; }
