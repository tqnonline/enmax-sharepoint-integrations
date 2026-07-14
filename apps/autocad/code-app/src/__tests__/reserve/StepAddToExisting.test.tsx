import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, FormProvider } from "react-hook-form";
import { renderWithProviders } from "../helpers/renderWithProviders";
import type { ReserveForm } from "../../features/reserve/schema";
import type { ExistingBase } from "../../features/reserve/hooks/useSearchExistingBases";

const { createMutate, searchRef } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  searchRef: { data: [] as ExistingBase[], isFetching: false, lastArgs: null as unknown },
}));

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({ MaxRecordsPerReservation: 10 }),
}));
vi.mock("../../features/reserve/hooks/useSearchExistingBases", () => ({
  useSearchExistingBases: (q: string, reservationType: string, documentSubtype?: string) => {
    searchRef.lastArgs = { q, reservationType, documentSubtype };
    return {
      data: q.trim().length >= 2 ? searchRef.data : [],
      isFetching: searchRef.isFetching,
    };
  },
}));
vi.mock("../../features/reserve/hooks/useCreateReservation", () => ({
  useCreateReservation: () => ({ mutateAsync: createMutate, isPending: false, error: null, reset: vi.fn() }),
}));

import { StepAddToExisting } from "../../features/reserve/steps/StepAddToExisting";

const BASE: ExistingBase = {
  id: "d1",
  number: "GG-CG-00-ECS-AST-DD-0001",
  title: "Base drawing",
  childCount: 3,
  state: 1,
  business: "bus-1", asset: "asset-a", unit: "unit-1",
  domain: "dom-1", system: "sys-1", kind: "kind-1",
};

function Harness({ subtype }: { subtype?: "Standard" | "Procedure" | "Form" }) {
  const methods = useForm<ReserveForm>({
    defaultValues: {
      reservationType: subtype ? "Document" : "Drawing",
      documentSubtype: subtype,
      sequenceType: "Existing",
      count: 1,
      sheetsPerDrawing: 1,
    },
  });
  return (
    <FormProvider {...methods}>
      <StepAddToExisting onBack={() => {}} />
    </FormProvider>
  );
}

beforeEach(() => {
  createMutate.mockReset();
  searchRef.data = [];
  searchRef.isFetching = false;
  searchRef.lastArgs = null;
});

test("Drawing: creates an append reservation with target base", async () => {
  searchRef.data = [BASE];
  createMutate.mockResolvedValue({ id: "RES-1", number: "RES-1057" });

  const user = userEvent.setup();
  renderWithProviders(<Harness />, { initialPath: "/reserve" });

  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  expect(searchRef.lastArgs).toMatchObject({ reservationType: "Drawing" });
  await user.click(await screen.findByText(BASE.number));

  const count = await screen.findByRole("spinbutton");
  fireEvent.change(count, { target: { value: "2" } });

  await user.click(screen.getByRole("button", { name: /Add Drawing Documents/i }));

  await waitFor(() => expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({
    targetDrawingId: "d1",
    count: 2,
    sequenceType: "Existing",
  })));
});

test("Procedure: search is scoped to procedure taxonomy", async () => {
  searchRef.data = [BASE];
  const user = userEvent.setup();
  renderWithProviders(<Harness subtype="Procedure" />, { initialPath: "/reserve" });
  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  expect(searchRef.lastArgs).toMatchObject({ reservationType: "Document", documentSubtype: "Procedure" });
});

test("Form: creates an append reservation with target base", async () => {
  searchRef.data = [BASE];
  createMutate.mockResolvedValue({ id: "RES-3", number: "RES-3" });

  const user = userEvent.setup();
  renderWithProviders(<Harness subtype="Form" />, { initialPath: "/reserve" });

  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  expect(searchRef.lastArgs).toMatchObject({ reservationType: "Document", documentSubtype: "Form" });
  await user.click(await screen.findByText(BASE.number));

  const count = await screen.findByRole("spinbutton");
  fireEvent.change(count, { target: { value: "2" } });

  await user.click(screen.getByRole("button", { name: /Add Forms/i }));

  await waitFor(() => expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({
    targetDrawingId: "d1",
    count: 2,
    documentSubtype: "Form",
    sequenceType: "Existing",
  })));
});

test("Standard: selecting an existing coding issues the next base via the reservation path", async () => {
  searchRef.data = [{ ...BASE, childCount: 0 }];
  createMutate.mockResolvedValue({ id: "RES-2", number: "RES-2" });

  const user = userEvent.setup();
  renderWithProviders(<Harness subtype="Standard" />, { initialPath: "/reserve" });

  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  expect(searchRef.lastArgs).toMatchObject({ documentSubtype: "Standard" });
  await user.click(await screen.findByText(BASE.number));

  await user.click(screen.getByRole("button", { name: /Add standard document/i }));

  await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
  const form = createMutate.mock.calls[0][0] as ReserveForm & { targetDrawingId?: string };
  expect(form.reservationType).toBe("Document");
  expect(form.documentSubtype).toBe("Standard");
  expect(form.sequenceType).toBe("Existing");
  expect(form.targetDrawingId).toBeUndefined();
});

test("Standard: count input is capped by MaxRecordsPerReservation", async () => {
  searchRef.data = [{ ...BASE, childCount: 0 }];
  const user = userEvent.setup();
  renderWithProviders(<Harness subtype="Standard" />, { initialPath: "/reserve" });

  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  await user.click(await screen.findByText(BASE.number));

  const count = await screen.findByRole("spinbutton");
  expect(count).toHaveAttribute("max", "10");
  expect(screen.getByText(/How many standard documents to add \(1–10\)/i)).toBeInTheDocument();
});
