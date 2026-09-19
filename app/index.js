// Phase 1 bridge route (Expo Router migration - see the approved plan) -
// the ENTIRE existing app, completely unmodified, becomes this one route
// for now. Later phases peel screens off into their own real routes under
// app/(tabs)/ one at a time; this file goes away (replaced by a real
// <Redirect href="/(tabs)/home" />) once Home itself is migrated in Phase 5.
import App from '../App';

export default App;
