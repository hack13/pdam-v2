import type { APIRoute } from 'astro';
import { getSessionFromContext } from '../../../../lib/session';
import { requireAdmin } from '../../../../lib/admin';
import { reconcileUserStorage, reconcileAllUsersStorage } from '../../../../lib/storage-accounting';

export const GET: APIRoute = async (context) => {
  const session = await getSessionFromContext(context);

  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(context.request.url);
  const userId = url.searchParams.get('userId');
  const all = url.searchParams.get('all') === 'true';

  try {
    if (userId) {
      if (userId !== session.user.id) {
        const admin = await requireAdmin(context);
        if (admin instanceof Response) return admin;
      }

      const result = await reconcileUserStorage(userId);
      return new Response(
        JSON.stringify({
          success: true,
          userId,
          logicalBytesUsed: result.logicalBytesUsed,
          physicalBytesUsed: result.physicalBytesUsed,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (all) {
      const admin = await requireAdmin(context);
      if (admin instanceof Response) return admin;

      const results = await reconcileAllUsersStorage();
      return new Response(
        JSON.stringify({
          success: true,
          usersReconciled: results.length,
          users: results,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Must specify ?userId=<id> or ?all=true',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Storage reconciliation error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to reconcile storage',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
