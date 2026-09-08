'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { tidyBoxCode } from '@/lib/codes'

export type EditState = { problem?: string; saved?: boolean; imageUrl?: string }

/** Pictures a browser is allowed to hand us, and how big they may be. */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Edit a box.
 *
 * A creator owns the name, the description and the picture. They do not own the
 * box's existence: there is no delete, here or anywhere. A live box is a
 * standing ₦100,000 promise to everyone who has spent a coin on it, and letting
 * the person who owes that money make it disappear is the one change that would
 * break the deal. Boxes end by being beaten, not by being removed.
 *
 * Ownership is checked twice on purpose. The `eq('creator_id')` on the update
 * is what actually enforces it — a form post can name any box code it likes,
 * and the page that renders the form is not a security boundary.
 */
export async function saveBox(_state: EditState, formData: FormData): Promise<EditState> {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const code = tidyBoxCode(String(formData.get('code') ?? ''))
  const title = String(formData.get('title') ?? '').trim().slice(0, 60)
  const description = String(formData.get('description') ?? '').trim().slice(0, 280)

  const { data: box } = await supabase
    .from('boxes')
    .select('id, creator_id, image_url')
    .eq('code', code)
    .maybeSingle()

  if (!box || box.creator_id !== profile.id) return { problem: 'That is not your box.' }

  let imageUrl = box.image_url as string
  const picture = formData.get('image')

  if (picture instanceof File && picture.size > 0) {
    if (!ALLOWED.includes(picture.type)) {
      return { problem: 'Pictures must be a JPEG, PNG or WebP.' }
    }
    if (picture.size > MAX_BYTES) {
      return { problem: 'That picture is too big. Keep it under 4MB.' }
    }

    // Uploaded with the service-role key rather than from the browser, so the
    // only things that ever reach the bucket have been past the two checks
    // above and belong to a box this person owns.
    const admin = supabaseAdmin()
    const extension = picture.type === 'image/png' ? 'png' : picture.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${box.id}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await admin.storage
      .from('box-images')
      .upload(path, picture, { contentType: picture.type, upsert: false })

    if (uploadError) {
      return {
        problem:
          'Could not save that picture. Check the "box-images" bucket exists in Supabase → ' +
          'Storage.',
      }
    }

    const { data: published } = admin.storage.from('box-images').getPublicUrl(path)
    imageUrl = published.publicUrl
  }

  const { error } = await supabase
    .from('boxes')
    .update({ title, description, image_url: imageUrl })
    .eq('id', box.id)
    .eq('creator_id', profile.id)

  if (error) return { problem: 'Could not save those changes. Try again.' }

  revalidatePath(`/b/${code}`)
  revalidatePath('/home')
  return { saved: true, imageUrl }
}

/** Take the picture off a box, without touching anything else. */
export async function removeImage(formData: FormData) {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()
  const code = tidyBoxCode(String(formData.get('code') ?? ''))

  await supabase
    .from('boxes')
    .update({ image_url: '' })
    .eq('code', code)
    .eq('creator_id', profile.id)

  revalidatePath(`/b/${code}`)
  revalidatePath(`/b/${code}/edit`)
}
