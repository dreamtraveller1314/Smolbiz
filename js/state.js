// Simple shared, in-memory state for the whole SPA.
export const state = {
  user: null,        // supabase auth user
  profile: null,      // row from profiles
  business: null,     // row from businesses
  onboarding: {        // scratch pad while an admin is signing up
    businessType: null,
    businessName: "",
    logoUrl: "",
    salesPlatform: "",
    monthlyRevenue: "",
    locationLat: null,
    locationLng: null,
    locationAddress: "",
    invites: []
  },
  activeChannelId: null,
  chatSubscription: null
};

export function resetOnboarding() {
  state.onboarding = {
    businessType: null,
    businessName: "",
    logoUrl: "",
    salesPlatform: "",
    monthlyRevenue: "",
    locationLat: null,
    locationLng: null,
    locationAddress: "",
    invites: []
  };
}
