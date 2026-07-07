import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, FormProvider } from "react-hook-form";
import { renderWithProviders } from "../helpers/renderWithProviders";
import type { ReserveForm } from "../../features/reserve/schema";
import type { ExistingBase } from "../../features/reserve/hooks/useSearchExistingBases";

const { addMutate, createMutate, searchRef } = vi.hoisted(() => ({
  addMutate: vi.fn(),
  createMutate: vi.fn(),
  searchRef: { data: [] as ExistingBase[], isFetching: false },
}));

vi.mock("../../config/useAppConfig", () => ({
  useAppConfig: () => ({ MaxDrawingsPerReservation: 10 }),
}));
vi.mock("../../features/reserve/hooks/useSearchExistingBases", () => ({
  useSearchExistingBases: (q: string) => ({
    data: q.trim().length >= 2 ? searchRef.data : [],
    isFetching: searchRef.isFetching,
  }),
}));
vi.mock("../../features/reserve/hooks/useAddChildItems", () => ({
  useAddChildItems: () => ({ mutateAsync: addMutate, isPending: false, error: null, reset: vi.fn() }),
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

function Harness({ subtype }: { subtype?: "Standard" | "Procedure" }) {
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
  addMutate.mockReset();
  createMutate.mockReset();
  searchRef.data = [];
  searchRef.isFetching = false;
});

test("Drawing: selecting an existing base appends child items via enmax_acdnAddChildItems", async () => {
  searchRef.data = [BASE];
  addMutate.mockResolvedValue({
    childrenCreated: 2, firstChildNumber: 4, lastChildNumber: 5, baseNumber: BASE.number,
  });

  const user = userEvent.setup();
  renderWithProviders(<Harness />, { initialPath: "/reserve" });

  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  await user.click(await screen.findByText(BASE.number));

  const count = await screen.findByRole("spinbutton");
  fireEvent.change(count, { target: { value: "2" } });

  await user.click(screen.getByRole("button", { name: /Add Drawing Documents/i }));

  await waitFor(() => expect(addMutate).toHaveBeenCalledWith({ drawingId: "d1", count: 2 }));
  expect(await screen.findByText(/Added 2 item/i)).toBeInTheDocument();
});

test("Standard: selecting an existing coding issues the next base via the reservation path", async () => {
  searchRef.data = [{ ...BASE, childCount: 0 }];
  createMutate.mockResolvedValue({ enmax_acdnreservationid: "RES-2" });

  const user = userEvent.setup();
  renderWithProviders(<Harness subtype="Standard" />, { initialPath: "/reserve" });

  await user.type(screen.getByPlaceholderText(/GG-CG-00/i), "GG");
  await user.click(await screen.findByText(BASE.number));

  await user.click(screen.getByRole("button", { name: /Add standard document/i }));

  await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
  const form = createMutate.mock.calls[0][0] as ReserveForm;
  expect(form.reservationType).toBe("Document");
  expect(form.documentSubtype).toBe("Standard");
  expect(form.sequenceType).toBe("Existing");
  expect(form.business).toBe("bus-1");
  expect(form.kind).toBe("kind-1");
  expect(form.count).toBe(1);
});
