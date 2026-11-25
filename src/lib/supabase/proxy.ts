import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from './config';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/bidder',
  '/seller',
  '/admin',
  '/profile',
  '/search',
  '/auctions',
  '/autobid',
  '/orders',
  '/notifications',
  '/compare',
  '/sellers',
  '/analytics',
];
const AUTH_ROUTES = ['/login', '/signup'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function redirectWithCookies(targetUrl: URL, sourceResponse: NextResponse): NextResponse {
  const redirectResponse = NextResponse.redirect(targetUrl);
  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  const { url, anonKey, isConfigured } = getSupabaseEnv();
  const pathname = request.nextUrl.pathname;

  if (!isConfigured) {
    if (isProtectedPath(pathname)) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('notice', 'demo');
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }

  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch';
  if (isPrefetch) {
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
    if (hasAuthCookie || !isProtectedPath(pathname)) {
      return NextResponse.next({ request });
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(pathname)) {
    return redirectWithCookies(new URL('/login', request.url), supabaseResponse);
  }

  if (user && isAuthRoute(pathname)) {
    return redirectWithCookies(new URL('/dashboard', request.url), supabaseResponse);
  }

  return supabaseResponse;
}
